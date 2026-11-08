import { ApiError } from "@google/genai";
import { ChapterPackageSchema, DEFAULT_PROFILES, type Character } from "@mumu/shared";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TTS_SAMPLE_RATE, pcmToWav } from "./audio.js";
import { DiskCache } from "./cache.js";
import { DraftPackageSchema, type DraftPackage } from "./draft.js";
import type { TtsGenerate } from "./gemini.js";
import { planClips, recapAudioId, ttsWav, voiceChapter } from "./voicing.js";

const wavOf = (seconds: number) => pcmToWav(Buffer.alloc(Math.round(seconds * TTS_SAMPLE_RATE) * 2, 1));

const existing: Character = {
  id: "chr_old",
  seriesId: "s",
  name: "Old Hand",
  description: "grey cloak",
  voiceSlot: "male_elder",
  profileId: "male_elder_1",
  // Differs from the live profile table on purpose: TTS must use this snapshot.
  voice: { voice: "Umbriel", style: "snapshot style", speed: 0.9, pitch: -2 },
  firstSeenChapterId: "c0",
};
const fresh: Character = {
  id: "chr_new",
  seriesId: "s",
  name: "Pepper",
  description: "witch",
  voiceSlot: "female_young",
  profileId: "female_young_1",
  voice: { voice: "Leda", style: "bright, lively", speed: 1.05, pitch: 0 },
  firstSeenChapterId: "c1",
};

const cue = (order: number, over: Record<string, unknown> = {}) => ({
  id: `cue_c1_${order}`,
  order,
  kind: "speech",
  pageIndex: 0,
  box: { x0: 0.1, y0: order / 20, x1: 0.4, y1: order / 20 + 0.03 },
  text: `Line ${order}`,
  characterId: null,
  emotion: "neutral",
  delivery: "normal",
  audioId: null,
  sfxTag: null,
  ...over,
});

const draft = (): DraftPackage =>
  DraftPackageSchema.parse({
    contractVersion: 1,
    seriesId: "s",
    chapterId: "c1",
    models: { vision: "v", reasoning: "r", tts: "t" },
    newCharacters: [fresh],
    cues: [
      cue(1, { kind: "narration", text: "Night falls." }),
      cue(2, { characterId: "chr_old", text: "Who goes there?", emotion: "angry", delivery: "shout" }),
      cue(3, { kind: "sfx", text: "BOOM", sfxTag: "explosion" }),
      cue(4, { characterId: "chr_new", text: "Me!", emotion: "happy" }),
      cue(5, { characterId: null, text: "Hm." }),
      cue(6, { kind: "narration", text: "..." }),
      cue(7, { kind: "thought", characterId: "chr_new", text: "Oh no." }),
    ],
    regions: [{ id: "reg_c1_1", start: { pageIndex: 0, y: 0.1 }, end: { pageIndex: 0, y: 0.4 }, mood: "calm", intensity: 1 }],
    recap: { text: "A guard challenges a witch." },
  });

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "mumu-voicing-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const quiet = () => {};

describe("planClips", () => {
  it("voices speech, thought and narration with letters/digits, never sfx or punctuation-only text, plus the recap", () => {
    const plans = planClips(draft(), [existing, fresh], DEFAULT_PROFILES);
    expect(plans.map((p) => p.cueId)).toEqual(["cue_c1_1", "cue_c1_2", "cue_c1_4", "cue_c1_5", "cue_c1_7", null]);
    expect(plans.at(-1)!.audioId).toBe(recapAudioId("c1"));
    expect(new Set(plans.map((p) => p.audioId)).size).toBe(plans.length);
  });

  it("uses character snapshots, the narrator profile for narration/unknown, and the recap style", () => {
    const narrator = DEFAULT_PROFILES.find((p) => p.id === "narrator_1")!;
    const byCue = new Map(planClips(draft(), [existing, fresh], DEFAULT_PROFILES).map((p) => [p.cueId, p.spec]));
    expect(byCue.get("cue_c1_2")).toEqual({ voice: "Umbriel", speed: 0.9, pitch: -2, style: "snapshot style, angry, intense, shouting loudly" });
    expect(byCue.get("cue_c1_4")).toMatchObject({ voice: "Leda", style: "bright, lively, cheerful" });
    expect(byCue.get("cue_c1_7")).toMatchObject({ voice: "Leda", style: "bright, lively, inner monologue, intimate, natural" });
    expect(byCue.get("cue_c1_1")).toMatchObject({ voice: narrator.voice, style: `${narrator.style} narration` });
    expect(byCue.get("cue_c1_5")).toMatchObject({ voice: narrator.voice, style: `${narrator.style} narration` });
    expect(byCue.get(null)).toMatchObject({ voice: narrator.voice, style: "playful, warm storyteller" });
  });

  it("an unknown character id fails loudly", () => {
    expect(() => planClips(draft(), [existing], DEFAULT_PROFILES)).toThrow(/chr_new/);
  });
});

describe("voiceChapter", () => {
  const run = (generate: TtsGenerate, over: { cast?: Character[]; log?: (l: string) => void } = {}) =>
    voiceChapter(draft(), { cast: over.cast ?? [existing], profiles: DEFAULT_PROFILES }, { model: "tts-test", cache: new DiskCache(dir), generate, concurrency: 3, log: over.log ?? quiet });

  it("builds a valid package: clips = voiced cues + 1, cues linked, recap linked", async () => {
    const generate = vi.fn<TtsGenerate>(async () => wavOf(0.5));
    const pkg = await run(generate);
    expect(ChapterPackageSchema.safeParse(pkg).success).toBe(true);
    expect(pkg.audio).toHaveLength(6); // 5 voiced cues + recap
    expect(pkg.cues.filter((c) => c.audioId !== null)).toHaveLength(5);
    expect(pkg.cues.find((c) => c.kind === "sfx")!.audioId).toBeNull();
    expect(pkg.cues.find((c) => c.text === "...")!.audioId).toBeNull();
    expect(pkg.recap?.audioId).toBe(recapAudioId("c1")); // lane A: delete with the recap (CONTRACT §5)
    for (const clip of pkg.audio) {
      expect(clip.mime).toBe("audio/mpeg");
      expect(clip.durationMs).toBeGreaterThan(0);
      expect(Buffer.from(clip.dataBase64, "base64").length).toBeGreaterThan(100);
    }
    // sped by each voice's own speed: 0.5 s at 0.9 -> 556 ms (cue 2), at 1.05 -> 476 ms (cue 4)
    const dur = (cueId: string) => pkg.audio.find((a) => a.id === pkg.cues.find((c) => c.id === cueId)!.audioId)!.durationMs;
    expect(dur("cue_c1_2")).toBe(556);
    expect(dur("cue_c1_4")).toBe(476);
  });

  it("sends the character's snapshot voice and the style string, verbatim text, to TTS", async () => {
    const generate = vi.fn<TtsGenerate>(async () => wavOf(0.2));
    await run(generate);
    expect(generate).toHaveBeenCalledWith({ model: "tts-test", voice: "Umbriel", style: "snapshot style, angry, intense, shouting loudly", text: "Who goes there?" });
    expect(generate).toHaveBeenCalledTimes(6);
  });

  it("second run makes 0 TTS calls and logs only cache hits", async () => {
    const generate = vi.fn<TtsGenerate>(async () => wavOf(0.3));
    await run(generate);
    expect(generate).toHaveBeenCalledTimes(6);

    const second = vi.fn<TtsGenerate>(async () => {
      throw new Error("must not be called");
    });
    const logs: string[] = [];
    const pkg = await run(second, { log: (l) => logs.push(l) });
    expect(second).not.toHaveBeenCalled();
    expect(logs).toHaveLength(6);
    expect(logs.every((l) => l.startsWith("cache hit"))).toBe(true);
    expect(pkg.audio).toHaveLength(6);
  });

  it("changing only speed or pitch re-encodes the cached WAV with no new TTS calls", async () => {
    const generate = vi.fn<TtsGenerate>(async () => wavOf(0.4));
    const before = await run(generate);
    const tuned: Character = { ...existing, voice: { ...existing.voice, speed: 1.2, pitch: 4 } };
    const second = vi.fn<TtsGenerate>(async () => {
      throw new Error("must not be called");
    });
    const after = await run(second, { cast: [tuned] });
    expect(second).not.toHaveBeenCalled();
    const clipOf = (pkg: typeof before) => pkg.audio.find((a) => a.id === "aud_c1_2")!;
    expect(clipOf(after).durationMs).toBe(333); // 400 ms / 1.2
    expect(clipOf(after).durationMs).not.toBe(clipOf(before).durationMs);
    expect(clipOf(after).dataBase64).not.toBe(clipOf(before).dataBase64);
  });

  it("identical voice, style and text in one run share one call", async () => {
    const d = draft();
    const twin = DraftPackageSchema.parse({ ...d, cues: [cue(1, { kind: "narration", text: "Same." }), cue(2, { kind: "narration", text: "Same." })] });
    const generate = vi.fn<TtsGenerate>(async () => wavOf(0.2));
    const pkg = await voiceChapter(twin, { cast: [], profiles: DEFAULT_PROFILES }, { model: "m", cache: new DiskCache(dir), generate, concurrency: 3, log: quiet });
    expect(generate).toHaveBeenCalledTimes(2); // "Same." once + the recap
    expect(pkg.audio).toHaveLength(3); // still one clip per voiced cue + recap
  });

  it("a failing clip fails the whole chapter, naming the line", async () => {
    const generate: TtsGenerate = async ({ text }) => {
      if (text === "Me!") throw new ApiError({ message: "bad request", status: 400 });
      return wavOf(0.2);
    };
    await expect(run(generate)).rejects.toThrow(/Leda "Me!" failed/);
  });
});

describe("ttsWav retries", () => {
  const ctx = (generate: TtsGenerate) => ({ model: "m", cache: new DiskCache(dir), generate, log: quiet, sleep: async () => {} });

  it("retries once on an unusable reply, then succeeds", async () => {
    let n = 0;
    const generate = vi.fn<TtsGenerate>(async () => (++n === 1 ? Buffer.from("not a wav, just text") : wavOf(0.2)));
    await ttsWav({ voice: "Kore", style: "x" }, "Hello", ctx(generate));
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("fails after two unusable replies and does not cache them", async () => {
    const generate = vi.fn<TtsGenerate>(async () => Buffer.from("nope"));
    await expect(ttsWav({ voice: "Kore", style: "x" }, "Hello", ctx(generate))).rejects.toThrow(/failed twice/);
    expect(generate).toHaveBeenCalledTimes(2);
    const ok = vi.fn<TtsGenerate>(async () => wavOf(0.2));
    await ttsWav({ voice: "Kore", style: "x" }, "Hello", ctx(ok));
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("backs off on 429 then succeeds; a 400 is not retried", async () => {
    let n = 0;
    const sleeps: number[] = [];
    const flaky = vi.fn<TtsGenerate>(async () => {
      if (++n === 1) throw new ApiError({ message: "busy", status: 503 });
      return wavOf(0.2);
    });
    await ttsWav({ voice: "Kore", style: "x" }, "Backoff", { ...ctx(flaky), sleep: async (ms) => void sleeps.push(ms) });
    expect(sleeps).toEqual([1000]);

    const bad = vi.fn<TtsGenerate>(async () => {
      throw new ApiError({ message: "model not found", status: 404 });
    });
    await expect(ttsWav({ voice: "Kore", style: "x" }, "Nope", ctx(bad))).rejects.toThrow(/model not found/);
    expect(bad).toHaveBeenCalledTimes(1);
  });

  it("keys on model, voice, style and text only", async () => {
    const generate = vi.fn<TtsGenerate>(async () => wavOf(0.2));
    const c = ctx(generate);
    await ttsWav({ voice: "Kore", style: "x" }, "Same", c);
    await ttsWav({ voice: "Kore", style: "x" }, "Same", c);
    expect(generate).toHaveBeenCalledTimes(1);
    await ttsWav({ voice: "Kore", style: "y" }, "Same", c);
    await ttsWav({ voice: "Puck", style: "x" }, "Same", c);
    await ttsWav({ voice: "Kore", style: "x" }, "Other", c);
    expect(generate).toHaveBeenCalledTimes(4);
  });
});
