import { ApiError } from "@google/genai";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiskCache } from "./cache.js";
import type { VisionGenerate } from "./gemini.js";
import { withBackoff } from "./retry.js";
import type { Segment } from "./slice.js";
import { analyzeChapter, analyzeSegment, visionJsonSchema, type VisionContext } from "./vision.js";

const GOOD = {
  items: [
    {
      kind: "speech",
      text: "Hello there.",
      box: [100, 200, 300, 500],
      emotion: "happy",
      delivery: "normal",
      speakerHint: "girl with a red ribbon",
      speakerCastId: null,
      sfxTag: null,
    },
  ],
  mood: "calm",
  intensity: 1,
};

async function makeSegment(index = 0): Promise<Segment> {
  const image = await sharp({ create: { width: 40, height: 60, channels: 3, background: { r: index * 40, g: 9, b: 9 } } })
    .jpeg()
    .toBuffer();
  return { index, pageIndex: 0, top: 0, height: 60, pageWidth: 40, pageHeight: 60, image };
}

describe("vision stage", () => {
  let dir: string;
  let logs: string[];
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "mumu-vision-"));
    logs = [];
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const ctxWith = (generate: VisionGenerate): VisionContext => ({
    model: "test-model",
    cast: [],
    cache: new DiskCache(dir),
    generate,
    sleep: async () => {},
    log: (l) => logs.push(l),
  });

  it("calls the API once, then serves the second run from cache", async () => {
    const generate = vi.fn<VisionGenerate>(async () => JSON.stringify(GOOD));
    const seg = await makeSegment();
    const first = await analyzeSegment(seg, 1, ctxWith(generate));
    const second = await analyzeSegment(seg, 1, ctxWith(generate));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(logs[0]).toMatch(/^API call/);
    expect(logs[1]).toMatch(/^cache hit/);
  });

  it("misses the cache when the model or the cast changes", async () => {
    const generate = vi.fn<VisionGenerate>(async () => JSON.stringify(GOOD));
    const seg = await makeSegment();
    await analyzeSegment(seg, 1, ctxWith(generate));
    await analyzeSegment(seg, 1, { ...ctxWith(generate), model: "other-model" });
    const cast = [
      { id: "chr_1", seriesId: "s", name: "Ann", description: "red ribbon", voiceSlot: "female_young" as const, profileId: "female_young_1", firstSeenChapterId: "c" },
    ];
    await analyzeSegment(seg, 1, { ...ctxWith(generate), cast });
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("retries once when the response fails validation", async () => {
    const generate = vi
      .fn<VisionGenerate>()
      .mockResolvedValueOnce(JSON.stringify({ ...GOOD, mood: "furious" }))
      .mockResolvedValueOnce(JSON.stringify(GOOD));
    const result = await analyzeSegment(await makeSegment(), 3, ctxWith(generate));
    expect(result.mood).toBe("calm");
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("fails naming the stage and segment after two bad responses, and caches nothing", async () => {
    const generate = vi.fn<VisionGenerate>(async () => "not json");
    const seg = await makeSegment(6);
    await expect(analyzeSegment(seg, 19, ctxWith(generate))).rejects.toThrow(/vision segment 7\/19.*failed validation twice/);
    expect(generate).toHaveBeenCalledTimes(2);
    await expect(analyzeSegment(seg, 19, ctxWith(generate))).rejects.toThrow();
    expect(generate).toHaveBeenCalledTimes(4);
  });

  it("rejects boxes that are inverted or out of range", async () => {
    const bad = { ...GOOD, items: [{ ...GOOD.items[0], box: [300, 200, 100, 500] }] };
    const generate = vi.fn<VisionGenerate>(async () => JSON.stringify(bad));
    await expect(analyzeSegment(await makeSegment(), 1, ctxWith(generate))).rejects.toThrow(/box/);
  });

  it("stops after an earlier segment fails", async () => {
    const segs = [await makeSegment(0), await makeSegment(1), await makeSegment(2)];
    const generate = vi.fn<VisionGenerate>(async () => "not json");
    await expect(analyzeChapter(segs, ctxWith(generate), 1)).rejects.toThrow(/segment 1\/3/);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("returns results in segment order", async () => {
    const segs = [await makeSegment(0), await makeSegment(1)];
    const results = await analyzeChapter(segs, ctxWith(async () => JSON.stringify(GOOD)), 2);
    expect(results.map((r) => r.segment.index)).toEqual([0, 1]);
  });

  it("sends a schema Gemini accepts the keywords of", () => {
    const json = JSON.stringify(visionJsonSchema());
    expect(json).not.toContain("$schema");
    expect(json).not.toContain('"const"');
  });
});

describe("withBackoff", () => {
  const apiError = (status: number) => new ApiError({ message: `http ${status}`, status });

  it("waits 1 s, 2 s, 4 s on 429 then succeeds", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const value = await withBackoff(
      async () => {
        if (++calls < 4) throw apiError(429);
        return "ok";
      },
      { sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(value).toBe("ok");
    expect(sleeps).toEqual([1000, 2000, 4000]);
  });

  it("gives up after the third retry and rethrows the original error", async () => {
    const err = apiError(503);
    let calls = 0;
    await expect(
      withBackoff(
        async () => {
          calls++;
          throw err;
        },
        { sleep: async () => {} },
      ),
    ).rejects.toBe(err);
    expect(calls).toBe(4);
  });

  it("does not retry 400s or plain errors", async () => {
    for (const err of [apiError(400), new Error("boom")]) {
      let calls = 0;
      await expect(
        withBackoff(
          async () => {
            calls++;
            throw err;
          },
          { sleep: async () => {} },
        ),
      ).rejects.toBe(err);
      expect(calls).toBe(1);
    }
  });
});
