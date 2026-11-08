import { DEFAULT_PROFILES, type Character, type JobStatus } from "@mumu/shared";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client.ts";
import { targetSize } from "./downscale.ts";
import { buildJobMeta } from "./jobMeta.ts";
import { JobExpiredError, JobFailedError, MAX_NETWORK_ERRORS, pollJob } from "./poll.ts";
import { buildSteps, isBusy, STEP_STATES, viewProgress } from "./steps.ts";

function character(id: string, seriesId: string): Character {
  return {
    id,
    seriesId,
    name: id,
    description: "someone",
    voiceSlot: "male_young",
    profileId: "male_young_1",
    voice: { voice: "Puck", style: "energetic, confident", speed: 1.05, pitch: 2 },
    firstSeenChapterId: "chp_1",
  };
}

describe("buildSteps", () => {
  it("checks the steps before the active one", () => {
    const rows = buildSteps({ kind: "running", state: "voicing", progress: 0.7, message: "Voicing 23/61 lines" });
    expect(rows.map((r) => r.status)).toEqual(["done", "done", "done", "done", "done", "active", "pending"]);
    expect(rows.find((r) => r.status === "active")?.detail).toBe("Voicing 23/61 lines");
  });

  it("has one step per working JobState", () => {
    expect(buildSteps({ kind: "done" }).map((r) => r.state)).toEqual([...STEP_STATES]);
    expect(buildSteps({ kind: "done" }).every((r) => r.status === "done")).toBe(true);
  });

  it("marks the step that was active when the job failed", () => {
    const rows = buildSteps({ kind: "failed", error: "boom", atState: "analyzing" });
    expect(rows.map((r) => r.status)).toEqual(["done", "done", "failed", "pending", "pending", "pending", "pending"]);
  });

  it("keeps the last step active while the package is stored", () => {
    const rows = buildSteps({ kind: "storing" });
    expect(rows.at(-1)?.status).toBe("active");
  });

  it("reports progress and busy state", () => {
    expect(viewProgress({ kind: "running", state: "analyzing", progress: 1, message: "" })).toBeLessThan(1);
    expect(viewProgress({ kind: "done" })).toBe(1);
    expect(isBusy({ kind: "storing" })).toBe(true);
    expect(isBusy({ kind: "failed", error: "x", atState: null })).toBe(false);
    expect(isBusy(undefined)).toBe(false);
  });
});

describe("buildJobMeta", () => {
  const input = { seriesId: "ser_1", chapterId: "chp_2", profiles: DEFAULT_PROFILES };

  it("sends only this series' cast, each with its own voice snapshot, and all 30 profiles", () => {
    const meta = buildJobMeta({ ...input, cast: [character("chr_a", "ser_1"), character("chr_b", "ser_other")] });
    expect(meta.cast.map((c) => c.id)).toEqual(["chr_a"]);
    expect(meta.cast[0]?.voice).toEqual({ voice: "Puck", style: "energetic, confident", speed: 1.05, pitch: 2 });
    expect(meta.profiles).toHaveLength(30);
    expect(meta.chapterId).toBe("chp_2");
  });

  it("accepts an empty cast (a first chapter)", () => {
    expect(buildJobMeta({ ...input, cast: [] }).cast).toEqual([]);
  });

  it("fails loudly without the narrator profile", () => {
    expect(() =>
      buildJobMeta({ ...input, cast: [], profiles: DEFAULT_PROFILES.filter((p) => p.id !== "narrator_1") }),
    ).toThrow(/narrator_1/);
  });
});

describe("targetSize", () => {
  it("shrinks wide pages to 800 px keeping the aspect ratio", () => {
    expect(targetSize(1600, 6400)).toEqual({ width: 800, height: 3200 });
    expect(targetSize(1000, 3001)).toEqual({ width: 800, height: 2401 });
  });
  it("never upscales", () => {
    expect(targetSize(700, 2000)).toEqual({ width: 700, height: 2000 });
  });
  it("rejects a bad size", () => {
    expect(() => targetSize(0, 100)).toThrow();
  });
});

describe("pollJob", () => {
  const status = (state: JobStatus["state"], extra: Partial<JobStatus> = {}): JobStatus => ({
    state,
    progress: 0.5,
    message: `${state}…`,
    ...extra,
  });
  const noSleep = () => Promise.resolve();

  it("reports each status and resolves on done", async () => {
    const seq = [status("queued"), status("analyzing"), status("done", { progress: 1 })];
    const seen: string[] = [];
    await pollJob("job_1", {
      getStatus: () => Promise.resolve(seq.shift()!),
      sleep: noSleep,
      onStatus: (s) => seen.push(s.state),
    });
    expect(seen).toEqual(["queued", "analyzing", "done"]);
  });

  it("sleeps 1.5 s between polls", async () => {
    const sleep = vi.fn((_ms: number) => Promise.resolve());
    const seq = [status("queued"), status("done")];
    await pollJob("job_1", { getStatus: () => Promise.resolve(seq.shift()!), sleep, onStatus: () => {} });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep.mock.calls[0]?.[0]).toBe(1500);
  });

  it("throws the server's error text when the job fails", async () => {
    await expect(
      pollJob("job_1", {
        getStatus: () => Promise.resolve(status("failed", { error: "Vision failed on segment 3" })),
        sleep: noSleep,
        onStatus: () => {},
      }),
    ).rejects.toThrow(new JobFailedError("Vision failed on segment 3"));
  });

  it("reports an unknown job (404) as expired", async () => {
    await expect(
      pollJob("job_1", {
        getStatus: () => Promise.reject(new ApiError("Not found", 404)),
        sleep: noSleep,
        onStatus: () => {},
      }),
    ).rejects.toBeInstanceOf(JobExpiredError);
  });

  it("survives a short network blip but not a dead server", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const blip = [new ApiError("down", 0), status("done")];
    await pollJob("job_1", {
      getStatus: () => {
        const next = blip.shift()!;
        return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
      },
      sleep: noSleep,
      onStatus: () => {},
    });

    let calls = 0;
    await expect(
      pollJob("job_1", {
        getStatus: () => {
          calls++;
          return Promise.reject(new ApiError("down", 0));
        },
        sleep: noSleep,
        onStatus: () => {},
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(calls).toBe(MAX_NETWORK_ERRORS);
  });

  it("stops when aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("stop"));
    await expect(
      pollJob("job_1", { getStatus: () => Promise.resolve(status("queued")), sleep: noSleep, onStatus: () => {}, signal: controller.signal }),
    ).rejects.toThrow("stop");
  });
});
