import type { ChapterPackage } from "@mumu/shared";
import { describe, expect, it } from "vitest";
import { progressFraction } from "./progress.js";
import { JOB_RETENTION_MS, JobStore } from "./store.js";

const PKG = { chapterId: "c" } as unknown as ChapterPackage;

describe("JobStore", () => {
  it("starts queued and tracks updates", () => {
    const store = new JobStore();
    const id = store.create();
    expect(store.status(id)).toEqual({ state: "queued", progress: 0, message: "Queued" });
    store.update(id, "analyzing", 0.2, "Analyzing segment 2/9");
    expect(store.status(id)).toEqual({ state: "analyzing", progress: 0.2, message: "Analyzing segment 2/9" });
    expect(store.lookupPackage(id)).toMatchObject({ kind: "pending" });
  });

  it("completes with the package", () => {
    const store = new JobStore();
    const id = store.create();
    store.complete(id, PKG);
    expect(store.status(id)).toMatchObject({ state: "done", progress: 1 });
    expect(store.lookupPackage(id)).toEqual({ kind: "ready", pkg: PKG });
  });

  it("ignores progress that arrives after the job finished", () => {
    const store = new JobStore();
    const id = store.create();
    store.fail(id, "boom");
    store.update(id, "voicing", 0.8, "late");
    expect(store.status(id)).toMatchObject({ state: "failed", error: "boom" });
  });

  it("keeps the progress reached when a job fails", () => {
    const store = new JobStore();
    const id = store.create();
    store.update(id, "voicing", 0.7, "x");
    store.fail(id, "boom");
    expect(store.status(id)?.progress).toBe(0.7);
  });

  it("forgets a finished job 30 minutes after it finished, not before", () => {
    let now = 1_000;
    const store = new JobStore(() => now);
    const id = store.create();
    store.complete(id, PKG);
    now += JOB_RETENTION_MS - 1;
    expect(store.lookupPackage(id).kind).toBe("ready");
    now += 1;
    expect(store.lookupPackage(id)).toEqual({ kind: "missing" });
    expect(store.status(id)).toBeNull();
  });

  it("never expires a job that is still running", () => {
    let now = 0;
    const store = new JobStore(() => now);
    const id = store.create();
    now += JOB_RETENTION_MS * 10;
    expect(store.status(id)?.state).toBe("queued");
  });

  it("returns copies, so callers cannot change a job", () => {
    const store = new JobStore();
    const id = store.create();
    store.status(id)!.progress = 0.9;
    expect(store.status(id)?.progress).toBe(0);
  });

  it("gives every job its own id", () => {
    const store = new JobStore();
    expect(new Set([store.create(), store.create(), store.create()]).size).toBe(3);
  });
});

describe("progressFraction", () => {
  it("never goes backwards across the pipeline and stays under 1 until done", () => {
    const steps = [
      progressFraction({ state: "slicing", message: "" }),
      progressFraction({ state: "analyzing", message: "", done: 0, total: 9 }),
      progressFraction({ state: "analyzing", message: "", done: 5, total: 9 }),
      progressFraction({ state: "analyzing", message: "", done: 9, total: 9 }),
      progressFraction({ state: "reasoning", message: "" }),
      progressFraction({ state: "casting", message: "" }),
      progressFraction({ state: "voicing", message: "", done: 0, total: 16 }),
      progressFraction({ state: "voicing", message: "", done: 8, total: 16 }),
      progressFraction({ state: "voicing", message: "", done: 16, total: 16 }),
      progressFraction({ state: "packaging", message: "" }),
    ];
    for (let i = 1; i < steps.length; i++) expect(steps[i]!).toBeGreaterThanOrEqual(steps[i - 1]!);
    expect(Math.max(...steps)).toBeLessThan(1);
    expect(steps[0]).toBe(0);
  });
  it("clamps counts that overshoot", () => {
    expect(progressFraction({ state: "voicing", message: "", done: 99, total: 16 })).toBeLessThan(1);
  });
  it("is 1 only for done", () => {
    expect(progressFraction({ state: "done", message: "" })).toBe(1);
  });
});
