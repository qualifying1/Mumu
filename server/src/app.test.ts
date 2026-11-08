import { ChapterPackageSchema, DEFAULT_PROFILES, ErrorBodySchema, HealthSchema, JobStatusSchema, type ChapterPackage, type JobMeta } from "@mumu/shared";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp, type AppDeps } from "./app.js";
import { parseServerEnv } from "./env.js";
import type { RunChapter } from "./jobs/runner.js";

const samplePkg: ChapterPackage = ChapterPackageSchema.parse(JSON.parse(readFileSync(fileURLToPath(new URL("../../fixtures/sample.json", import.meta.url)), "utf8")));
const MODELS = { vision: "v-model", reasoning: "r-model", tts: "t-model" };
const META: JobMeta = { seriesId: "series_1", chapterId: "chapter_1", cast: [], profiles: [...DEFAULT_PROFILES] };
const narrator = DEFAULT_PROFILES.find((p) => p.id === "narrator_1")!;
const MP3_BYTES = Buffer.from([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4]);

let png: Buffer;
beforeAll(async () => {
  png = await sharp({ create: { width: 8, height: 12, channels: 3, background: "#fff" } }).png().toBuffer();
});

const servers: Array<{ close: () => void }> = [];
afterEach(() => {
  while (servers.length > 0) servers.pop()!.close();
});

interface Harness {
  url: string;
  runs: Array<Parameters<RunChapter>[0]>;
  previews: Array<{ profileId: string; text: string }>;
  /** Resolve or reject the pending pipeline run of the most recent job. */
  finish: (result?: ChapterPackage | Error) => void;
  progress: (p: Parameters<Parameters<RunChapter>[1]>[0]) => void;
}

function start(over: Partial<AppDeps> = {}): Harness {
  const runs: Harness["runs"] = [];
  const previews: Harness["previews"] = [];
  let settle: (r: ChapterPackage | Error) => void = () => {};
  let report: Harness["progress"] = () => {};
  const runChapter: RunChapter = (input, onProgress) => {
    runs.push(input);
    report = onProgress;
    return new Promise<ChapterPackage>((resolve, reject) => {
      settle = (r) => (r instanceof Error ? reject(r) : resolve(r));
    });
  };
  const app = createApp({
    corsOrigins: ["http://localhost:5173"],
    models: MODELS,
    runChapter,
    previewClip: async (profile, text) => {
      previews.push({ profileId: profile.id, text });
      return MP3_BYTES;
    },
    log: () => {},
    ...over,
  });
  const server = app.listen(0);
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, runs, previews, finish: (r = samplePkg) => settle(r), progress: (p) => report(p) };
}

function jobForm(opts: { meta?: unknown; pages?: Buffer[]; pageField?: string } = {}): FormData {
  const form = new FormData();
  const meta = opts.meta === undefined ? META : opts.meta;
  if (meta !== null) form.append("meta", typeof meta === "string" ? meta : JSON.stringify(meta));
  for (const [i, bytes] of (opts.pages ?? [png]).entries()) {
    form.append(opts.pageField ?? "pages", new Blob([new Uint8Array(bytes)], { type: "image/png" }), `p${i}.png`);
  }
  return form;
}

async function expectError(res: Response, status: number, errorPattern: RegExp) {
  expect(res.status).toBe(status);
  const body = ErrorBodySchema.parse(await res.json());
  expect(body.error).toMatch(errorPattern);
  return body;
}

async function waitForState(url: string, jobId: string, state: string) {
  for (let i = 0; i < 100; i++) {
    const status = JobStatusSchema.parse(await (await fetch(`${url}/jobs/${jobId}`)).json());
    if (status.state === state) return status;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`job ${jobId} never reached ${state}`);
}

describe("GET /health", () => {
  it("returns ok, the contract version and the models", async () => {
    const { url } = start();
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
    expect(HealthSchema.parse(await res.json())).toEqual({ ok: true, contractVersion: 1, models: MODELS });
  });
});

describe("jobs: create -> poll -> package", () => {
  it("runs the whole flow", async () => {
    const h = start();
    const created = await fetch(`${h.url}/jobs`, { method: "POST", body: jobForm({ pages: [png, png, png] }) });
    expect(created.status).toBe(202);
    const { jobId } = (await created.json()) as { jobId: string };
    expect(jobId).toMatch(/^job_/);

    const queued = JobStatusSchema.parse(await (await fetch(`${h.url}/jobs/${jobId}`)).json());
    expect(queued.state).toBe("queued");

    // the pipeline got the pages (in order) and the meta
    expect(h.runs).toHaveLength(1);
    expect(h.runs[0]!.pages).toHaveLength(3);
    expect(h.runs[0]).toMatchObject({ seriesId: "series_1", chapterId: "chapter_1", cast: [] });
    expect(h.runs[0]!.profiles).toHaveLength(30);

    h.progress({ state: "voicing", message: "Voicing 2/4 lines", done: 2, total: 4 });
    const running = JobStatusSchema.parse(await (await fetch(`${h.url}/jobs/${jobId}`)).json());
    expect(running).toMatchObject({ state: "voicing", message: "Voicing 2/4 lines" });
    expect(running.progress).toBeGreaterThan(0.5);
    expect(running.progress).toBeLessThan(1);

    const early = await fetch(`${h.url}/jobs/${jobId}/package`);
    const earlyBody = await expectError(early, 409, /not done/i);
    expect(earlyBody.detail).toContain("voicing");

    h.finish();
    const done = await waitForState(h.url, jobId, "done");
    expect(done.progress).toBe(1);

    const pkgRes = await fetch(`${h.url}/jobs/${jobId}/package`);
    expect(pkgRes.status).toBe(200);
    expect(ChapterPackageSchema.parse(await pkgRes.json())).toEqual(samplePkg);
  });

  it("passes the cast voices through exactly as sent", async () => {
    const h = start();
    const cast = [
      {
        id: "chr_1", seriesId: "series_1", name: "Ann", description: "red coat", voiceSlot: "female_young", profileId: "female_young_1",
        voice: { voice: "Kore", style: "bright", speed: 1.1, pitch: 2 }, firstSeenChapterId: "chapter_0",
      },
    ];
    const res = await fetch(`${h.url}/jobs`, { method: "POST", body: jobForm({ meta: { ...META, cast } }) });
    expect(res.status).toBe(202);
    expect(h.runs[0]!.cast).toEqual(cast);
  });

  it("reports a failed job with its error, and its package stays 409", async () => {
    const h = start();
    const { jobId } = (await (await fetch(`${h.url}/jobs`, { method: "POST", body: jobForm() })).json()) as { jobId: string };
    h.finish(new Error("tts \"Hi\" failed: quota"));
    const failed = await waitForState(h.url, jobId, "failed");
    expect(failed.error).toContain("quota");
    const body = await expectError(await fetch(`${h.url}/jobs/${jobId}/package`), 409, /not done/i);
    expect(body.detail).toContain("quota");
  });

  it("answers 404 with the error body for an unknown job", async () => {
    const { url } = start();
    await expectError(await fetch(`${url}/jobs/job_nope`), 404, /unknown or expired/i);
    await expectError(await fetch(`${url}/jobs/job_nope/package`), 404, /unknown or expired/i);
  });
});

describe("POST /jobs: bad requests return the error JSON", () => {
  it("no pages", async () => {
    const { url } = start();
    await expectError(await fetch(`${url}/jobs`, { method: "POST", body: jobForm({ pages: [] }) }), 400, /no pages/i);
  });
  it("pages under the wrong field name", async () => {
    const { url } = start();
    await expectError(await fetch(`${url}/jobs`, { method: "POST", body: jobForm({ pageField: "images" }) }), 400, /upload rejected/i);
  });
  it("missing meta", async () => {
    const { url } = start();
    await expectError(await fetch(`${url}/jobs`, { method: "POST", body: jobForm({ meta: null }) }), 400, /missing meta/i);
  });
  it("meta that is not JSON", async () => {
    const { url } = start();
    await expectError(await fetch(`${url}/jobs`, { method: "POST", body: jobForm({ meta: "{oops" }) }), 400, /not valid JSON/i);
  });
  it("meta that breaks the contract, naming the field", async () => {
    const { url } = start();
    const res = await fetch(`${url}/jobs`, { method: "POST", body: jobForm({ meta: { seriesId: "s", chapterId: "c", cast: "none", profiles: [] } }) });
    const body = await expectError(res, 400, /does not match the contract/i);
    expect(body.detail).toContain("cast");
  });
  it("a page that is not an image", async () => {
    const h = start();
    const res = await fetch(`${h.url}/jobs`, { method: "POST", body: jobForm({ pages: [png, Buffer.from("not an image")] }) });
    const body = await expectError(res, 400, /page 2 is not a readable image/i);
    expect(body.detail).toContain("p1.png");
    expect(h.runs).toHaveLength(0);
  });
  it("an unknown route", async () => {
    const { url } = start();
    await expectError(await fetch(`${url}/nope`), 404, /not found/i);
  });
});

describe("POST /preview", () => {
  const post = (url: string, body: unknown) => fetch(`${url}/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });

  it("returns audio/mpeg for the profile and text", async () => {
    const h = start();
    const res = await post(h.url, { profile: narrator, text: "Hello there." });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("audio/mpeg");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(MP3_BYTES);
    expect(h.previews).toEqual([{ profileId: "narrator_1", text: "Hello there." }]);
  });
  it("rejects text over 200 characters", async () => {
    const h = start();
    await expectError(await post(h.url, { profile: narrator, text: "x".repeat(201) }), 400, /invalid preview request/i);
    expect(h.previews).toHaveLength(0);
  });
  it("rejects an out-of-range speed and a missing profile", async () => {
    const { url } = start();
    const bad = await expectError(await post(url, { profile: { ...narrator, speed: 3 }, text: "Hi" }), 400, /invalid preview request/i);
    expect(bad.detail).toContain("speed");
    await expectError(await post(url, { text: "Hi" }), 400, /invalid preview request/i);
  });
  it("rejects malformed JSON", async () => {
    const { url } = start();
    await expectError(await post(url, "{nope"), 400, /bad request/i);
  });
  it("turns a TTS failure into a 502 with the error body", async () => {
    const { url } = start({
      previewClip: async () => {
        throw new Error("quota exceeded");
      },
    });
    const body = await expectError(await post(url, { profile: narrator, text: "Hi" }), 502, /voice preview failed/i);
    expect(body.detail).toContain("quota exceeded");
  });
});

describe("CORS", () => {
  it("allows a configured origin only", async () => {
    const { url } = start();
    const ok = await fetch(`${url}/health`, { headers: { origin: "http://localhost:5173" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    const other = await fetch(`${url}/health`, { headers: { origin: "http://evil.example" } });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("parseServerEnv", () => {
  it("splits CORS origins", () => {
    const env = parseServerEnv({ PORT: "8787", CORS_ORIGIN: "http://a, http://b" });
    expect(env).toEqual({ PORT: 8787, CORS_ORIGIN: ["http://a", "http://b"] });
  });
  it("fails loudly when PORT is missing", () => {
    expect(() => parseServerEnv({ CORS_ORIGIN: "http://a" })).toThrow(/PORT/);
  });
});
