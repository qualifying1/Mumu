import { DEFAULT_PROFILES, type Character } from "@mumu/shared";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiskCache } from "./cache.js";
import { castNewCharacters, loadCastFromPackages, pickProfileId } from "./cast.js";
import { buildChapterDraft } from "./chapter.js";
import { DraftPackageSchema, regionsFromOrders } from "./draft.js";
import type { ReasonGenerate, VisionGenerate } from "./gemini.js";
import { geminiJsonSchema } from "./jsonSchema.js";
import type { MergedLine } from "./merge.js";
import { buildReasonPrompt, findReasoningProblem, reasonChapter, reasonJsonSchema } from "./reason.js";
import type { ReasoningResult } from "./reasonSchema.js";

const line = (order: number, kind: MergedLine["kind"], text: string, over: Partial<MergedLine> = {}): MergedLine => ({
  order,
  kind,
  pageIndex: 0,
  box: { x0: 0.1, y0: order / 20, x1: 0.4, y1: order / 20 + 0.03 },
  text,
  emotion: "neutral",
  delivery: "normal",
  speakerHint: null,
  speakerCastId: null,
  sfxTag: null,
  mood: "calm",
  intensity: 1,
  ...over,
});

const LINES = [line(1, "narration", "Night falls."), line(2, "speech", "Who goes there?"), line(3, "sfx", "BOOM", { sfxTag: "explosion" }), line(4, "speech", "Me!")];

const GOOD: ReasoningResult = {
  speakers: [
    { order: 2, speaker: "new_1" },
    { order: 4, speaker: "new_2" },
  ],
  newCharacters: [
    { key: "new_1", name: "Guard", description: "armored man", voiceSlot: "male_deep" },
    { key: "new_2", name: "Pepper", description: "witch in a big hat", voiceSlot: "female_young" },
  ],
  regions: [
    { startOrder: 1, endOrder: 2, mood: "calm", intensity: 1 },
    { startOrder: 3, endOrder: 4, mood: "battle", intensity: 3 },
  ],
  recap: "A guard challenges a stranger and something explodes.",
};

const existing = (id: string, profileId: string): Character => ({
  id,
  seriesId: "s",
  name: id,
  description: "d",
  voiceSlot: "male_deep",
  profileId,
  firstSeenChapterId: "c0",
});

describe("geminiJsonSchema", () => {
  it("rewrites literal unions to enum and drops $schema", () => {
    const json = JSON.stringify(reasonJsonSchema());
    expect(json).not.toContain("$schema");
    expect(json).not.toContain('"const"');
    expect(json).toContain('"enum":[1,2,3]');
  });
  it("leaves plain schemas alone", async () => {
    const { z } = await import("zod");
    expect(geminiJsonSchema(z.object({ a: z.string() }))).toMatchObject({ type: "object" });
  });
});

describe("findReasoningProblem", () => {
  it("accepts a good answer", () => {
    expect(findReasoningProblem(GOOD, LINES, [])).toBeNull();
  });
  it("rejects a missing speaker entry", () => {
    expect(findReasoningProblem({ ...GOOD, speakers: [GOOD.speakers[0]!] }, LINES, [])).toMatch(/line 4 has no speakers entry/);
  });
  it("rejects a speaker entry on an sfx or narration line", () => {
    expect(findReasoningProblem({ ...GOOD, speakers: [...GOOD.speakers, { order: 3, speaker: null }] }, LINES, [])).toMatch(/sfx line/);
  });
  it("rejects an unknown speaker id", () => {
    expect(findReasoningProblem({ ...GOOD, speakers: [{ order: 2, speaker: "chr_nope" }, GOOD.speakers[1]!] }, LINES, [])).toMatch(/chr_nope/);
  });
  it("accepts a known cast id and null speakers", () => {
    const r = { ...GOOD, speakers: [{ order: 2, speaker: "chr_a" }, { order: 4, speaker: null }] };
    expect(findReasoningProblem(r, LINES, [existing("chr_a", "male_deep_1")])).toBeNull();
  });
  it("rejects regions that leave a gap, miss the start, or miss the end", () => {
    const gap = { ...GOOD, regions: [{ ...GOOD.regions[0]!, endOrder: 1 }, GOOD.regions[1]!] };
    expect(findReasoningProblem(gap, LINES, [])).toMatch(/region 2 must start at order 2/);
    const late = { ...GOOD, regions: [{ ...GOOD.regions[0]!, startOrder: 2 }, GOOD.regions[1]!] };
    expect(findReasoningProblem(late, LINES, [])).toMatch(/first region must start at order 1/);
    const short = { ...GOOD, regions: [GOOD.regions[0]!, { ...GOOD.regions[1]!, endOrder: 3 }] };
    expect(findReasoningProblem(short, LINES, [])).toMatch(/last region must end at order 4/);
  });
  it("rejects a duplicate or cast-colliding new character key", () => {
    const dup = { ...GOOD, newCharacters: [GOOD.newCharacters[0]!, GOOD.newCharacters[0]!] };
    expect(findReasoningProblem(dup, LINES, [])).toMatch(/listed twice/);
  });
});

describe("reasonChapter", () => {
  let dir: string;
  let logs: string[];
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "mumu-reason-"));
    logs = [];
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const ctx = (generate: ReasonGenerate) => ({ model: "m", cast: [], cache: new DiskCache(dir), generate, sleep: async () => {}, log: (l: string) => logs.push(l) });

  it("calls the API once, then serves the second run from cache", async () => {
    const generate = vi.fn<ReasonGenerate>(async () => JSON.stringify(GOOD));
    expect(await reasonChapter(LINES, ctx(generate))).toEqual(GOOD);
    expect(await reasonChapter(LINES, ctx(generate))).toEqual(GOOD);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(logs).toEqual(["API call   reasoning (4 lines)", "cache hit  reasoning (4 lines)"]);
  });

  it("retries once with the problem in the prompt, then succeeds", async () => {
    const bad = { ...GOOD, speakers: [GOOD.speakers[0]!] };
    const generate = vi.fn<ReasonGenerate>().mockResolvedValueOnce(JSON.stringify(bad)).mockResolvedValueOnce(JSON.stringify(GOOD));
    expect(await reasonChapter(LINES, ctx(generate))).toEqual(GOOD);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]![0].prompt).toContain("line 4 has no speakers entry");
  });

  it("fails naming the stage after two bad answers, and caches nothing", async () => {
    const generate = vi.fn<ReasonGenerate>(async () => "not json");
    await expect(reasonChapter(LINES, ctx(generate))).rejects.toThrow(/reasoning \(4 lines\) failed validation twice: response is not JSON/);
    expect(generate).toHaveBeenCalledTimes(2);
    await expect(reasonChapter(LINES, ctx(generate))).rejects.toThrow();
    expect(generate).toHaveBeenCalledTimes(4);
  });

  it("keys the cache on cast, not on voices", async () => {
    const generate = vi.fn<ReasonGenerate>(async () => JSON.stringify({ ...GOOD, speakers: [{ order: 2, speaker: "chr_a" }, { order: 4, speaker: null }] }));
    const a = existing("chr_a", "male_deep_1");
    await reasonChapter(LINES, { ...ctx(generate), cast: [a] });
    await reasonChapter(LINES, { ...ctx(generate), cast: [{ ...a, profileId: "male_deep_3" }] }); // voice change only
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("puts the cast and transcript in the prompt", () => {
    const prompt = buildReasonPrompt(LINES, [existing("chr_a", "male_deep_1")]);
    expect(prompt).toContain("chr_a | chr_a | d");
    expect(prompt).toContain("2 | speech | Who goes there? | - | - | calm/1");
  });
});

describe("casting", () => {
  it("takes the first unused profile of the slot, then falls back to _1 when all are used", () => {
    expect(pickProfileId("male_deep", new Set(), DEFAULT_PROFILES)).toBe("male_deep_1");
    expect(pickProfileId("male_deep", new Set(["male_deep_1"]), DEFAULT_PROFILES)).toBe("male_deep_2");
    expect(pickProfileId("male_deep", new Set(["male_deep_1", "male_deep_2"]), DEFAULT_PROFILES)).toBe("male_deep_3");
    expect(pickProfileId("male_deep", new Set(["male_deep_1", "male_deep_2", "male_deep_3"]), DEFAULT_PROFILES)).toBe("male_deep_1");
  });

  it("fails loudly when profiles for a slot are missing", () => {
    expect(() => pickProfileId("child", new Set(), [])).toThrow(/no voice profile child_1/);
  });

  it("gives two new characters of one slot different profiles, skipping existing ones, and drops unused keys", () => {
    let n = 0;
    const out = castNewCharacters({
      drafts: [
        { key: "new_1", name: "A", description: "a", voiceSlot: "male_deep" },
        { key: "new_2", name: "B", description: "b", voiceSlot: "male_deep" },
        { key: "new_3", name: "Silent", description: "s", voiceSlot: "child" },
      ],
      usedKeys: new Set(["new_1", "new_2"]),
      existingCast: [existing("chr_old", "male_deep_1")],
      profiles: DEFAULT_PROFILES,
      seriesId: "s1",
      chapterId: "ch2",
      newId: () => `chr_${++n}`,
    });
    expect(out.newCharacters.map((c) => [c.id, c.profileId])).toEqual([
      ["chr_1", "male_deep_2"],
      ["chr_2", "male_deep_3"],
    ]);
    expect(out.newCharacters[0]).toMatchObject({ seriesId: "s1", firstSeenChapterId: "ch2" });
    expect(out.idByKey.get("new_3")).toBeUndefined();
  });
});

describe("regionsFromOrders", () => {
  const cues = LINES.map((l) => ({ order: l.order, pageIndex: l.pageIndex, box: l.box }));
  const anchor = (order: number) => (cues[order - 1]!.box.y0 + cues[order - 1]!.box.y1) / 2;

  it("is contiguous: each region ends where the next starts; the last ends at its last cue", () => {
    const regions = regionsFromOrders(GOOD.regions, cues, "ch");
    expect(regions).toHaveLength(2);
    expect(regions[0]!.start.y).toBeCloseTo(anchor(1));
    expect(regions[0]!.end).toEqual(regions[1]!.start);
    expect(regions[1]!.start.y).toBeCloseTo(anchor(3));
    expect(regions[1]!.end.y).toBeCloseTo(anchor(4));
  });

  it("joins neighbours with the same mood and intensity", () => {
    const same = [
      { startOrder: 1, endOrder: 2, mood: "calm" as const, intensity: 1 as const },
      { startOrder: 3, endOrder: 4, mood: "calm" as const, intensity: 1 as const },
    ];
    expect(regionsFromOrders(same, cues, "ch")).toHaveLength(1);
  });
});

describe("loadCastFromPackages", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "mumu-cast-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads newCharacters and the series id from packages", async () => {
    const file = path.join(dir, "ch1.json");
    await writeFile(file, JSON.stringify({ seriesId: "s9", newCharacters: [existing("chr_a", "male_deep_1")], cues: [] }));
    const { seriesId, cast } = await loadCastFromPackages([file]);
    expect(seriesId).toBe("s9");
    expect(cast.map((c) => c.id)).toEqual(["chr_a"]);
  });

  it("rejects a file that is not a package", async () => {
    const file = path.join(dir, "bad.json");
    await writeFile(file, JSON.stringify({ hello: 1 }));
    await expect(loadCastFromPackages([file])).rejects.toThrow(/not a chapter package/);
  });

  it("rejects mixed series", async () => {
    const a = path.join(dir, "a.json");
    const b = path.join(dir, "b.json");
    await writeFile(a, JSON.stringify({ seriesId: "s1", newCharacters: [] }));
    await writeFile(b, JSON.stringify({ seriesId: "s2", newCharacters: [] }));
    await expect(loadCastFromPackages([a, b])).rejects.toThrow(/series s2 differs/);
  });
});

describe("buildChapterDraft", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "mumu-chapter-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("runs every stage and returns a valid draft package", async () => {
    const page = await sharp({ create: { width: 100, height: 150, channels: 3, background: { r: 200, g: 200, b: 200 } } }).jpeg().toBuffer();
    const visionGenerate = vi.fn<VisionGenerate>(async () =>
      JSON.stringify({
        items: [
          { kind: "speech", text: "Who goes there?", box: [100, 100, 200, 500], emotion: "angry", delivery: "shout", speakerHint: "guard", speakerCastId: null, sfxTag: null },
          { kind: "sfx", text: "BOOM", box: [600, 600, 700, 900], emotion: "neutral", delivery: "normal", speakerHint: null, speakerCastId: null, sfxTag: "explosion" },
        ],
        mood: "tense",
        intensity: 2,
      }),
    );
    const reasoning: ReasoningResult = {
      speakers: [{ order: 1, speaker: "new_1" }],
      newCharacters: [{ key: "new_1", name: "Guard", description: "armored man", voiceSlot: "male_deep" }],
      regions: [{ startOrder: 1, endOrder: 2, mood: "tense", intensity: 2 }],
      recap: "A guard shouts and things go boom.",
    };
    const reasonGenerate = vi.fn<ReasonGenerate>(async () => JSON.stringify(reasoning));
    const states: string[] = [];

    const { draft, lines } = await buildChapterDraft(
      { seriesId: "s1", chapterId: "ch1", pages: [{ bytes: page }], cast: [], profiles: DEFAULT_PROFILES },
      {
        models: { vision: "v", reasoning: "r", tts: "t" },
        cache: new DiskCache(dir),
        visionGenerate,
        reasonGenerate,
        visionConcurrency: 2,
        sleep: async () => {},
        log: () => {},
        onProgress: (p) => states.push(p.state),
        newCharacterId: () => "chr_guard",
      },
    );

    expect(DraftPackageSchema.safeParse(draft).success).toBe(true);
    expect(lines.map((l) => l.order)).toEqual([1, 2]);
    expect(draft.cues.map((c) => [c.order, c.kind, c.characterId, c.sfxTag, c.audioId])).toEqual([
      [1, "speech", "chr_guard", null, null],
      [2, "sfx", null, "explosion", null],
    ]);
    expect(draft.newCharacters).toEqual([
      { id: "chr_guard", seriesId: "s1", name: "Guard", description: "armored man", voiceSlot: "male_deep", profileId: "male_deep_1", firstSeenChapterId: "ch1" },
    ]);
    expect(draft.regions).toHaveLength(1);
    expect(draft.recap.text).toMatch(/guard/);
    expect(states).toEqual(["slicing", "slicing", "analyzing", "reasoning", "reasoning", "casting"]);
  });

  it("fails loudly when the chapter has no text", async () => {
    const page = await sharp({ create: { width: 100, height: 150, channels: 3, background: { r: 1, g: 1, b: 1 } } }).jpeg().toBuffer();
    const empty = async () => JSON.stringify({ items: [], mood: "calm", intensity: 1 });
    await expect(
      buildChapterDraft(
        { seriesId: "s", chapterId: "c", pages: [{ bytes: page }], cast: [], profiles: DEFAULT_PROFILES },
        { models: { vision: "v", reasoning: "r", tts: "t" }, cache: new DiskCache(dir), visionGenerate: empty, reasonGenerate: vi.fn(), visionConcurrency: 1, log: () => {} },
      ),
    ).rejects.toThrow(/no readable text/);
  });
});
