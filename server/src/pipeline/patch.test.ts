import { DEFAULT_PROFILES, type Cue } from "@mumu/shared";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadCastFromPackages } from "./cast.js";
import type { MergedLine } from "./merge.js";
import { ChapterPatchSchema, applyLinePatch, applySpeakerOverrides, loadPatch, type ChapterPatch } from "./patch.js";
import type { ReasoningResult } from "./reasonSchema.js";
import { planClips } from "./voicing.js";

const box = (y0: number, x0 = 0.1) => ({ x0, y0, x1: x0 + 0.3, y1: y0 + 0.05 });

const line = (order: number, kind: MergedLine["kind"], text: string, over: Partial<MergedLine> = {}): MergedLine => ({
  order,
  kind,
  pageIndex: 0,
  box: box(order / 10),
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

const LINES: MergedLine[] = [
  line(1, "narration", "Night falls."),
  line(2, "speech", "Take that!"),
  line(3, "sfx", "BOOM", { sfxTag: "explosion" }),
  line(4, "speech", "Amateur!", { mood: "battle", intensity: 3 }),
  line(5, "speech", "Take that!", { pageIndex: 1 }),
];
const CAST = [{ id: "chr_pepper" }, { id: "chr_carrot" }];

const patch = (p: Partial<Record<"add" | "fix" | "remove", unknown[]>>): ChapterPatch => ChapterPatchSchema.parse(p);
const texts = (lines: MergedLine[]) => lines.map((l) => `${l.order}:${l.text}`);

describe("applyLinePatch: fix", () => {
  it("sets a speaker, keeps every other line as it was, and reports the override by new order", () => {
    const out = applyLinePatch(LINES, patch({ fix: [{ match: "Amateur!", speaker: "chr_carrot" }] }), CAST);
    expect(out.speakerOverrides).toEqual(new Map([[4, "chr_carrot"]]));
    expect(out.lines[3]).toMatchObject({ text: "Amateur!", speakerCastId: "chr_carrot", order: 4 });
    expect(out.lines.filter((l) => l.order !== 4)).toEqual(LINES.filter((l) => l.order !== 4));
    expect(out.summary).toEqual({ added: 0, fixed: 1, removed: 0 });
  });

  it("matches ignoring case and punctuation", () => {
    const out = applyLinePatch(LINES, patch({ fix: [{ match: "amateur", emotion: "smug" }] }), CAST);
    expect(out.lines[3]!.emotion).toBe("smug");
  });

  it("can set the speaker to null (unknown, voiced by the narrator)", () => {
    const out = applyLinePatch(LINES, patch({ fix: [{ match: "Amateur!", speaker: null }] }), CAST);
    expect(out.speakerOverrides.get(4)).toBeNull();
  });

  it("corrects text, and drops the sfx tag when a line stops being an sfx", () => {
    const out = applyLinePatch(LINES, patch({ fix: [{ match: "BOOM", text: "Boom?", kind: "speech", speaker: "chr_pepper" }] }), CAST);
    expect(out.lines[2]).toMatchObject({ text: "Boom?", kind: "speech", sfxTag: null, speakerCastId: "chr_pepper" });
  });

  it("needs pageIndex or nth when the text repeats", () => {
    expect(() => applyLinePatch(LINES, patch({ fix: [{ match: "Take that!", speaker: "chr_pepper" }] }), CAST)).toThrow(/matches 2 lines.*order 2.*order 5/);
    const byPage = applyLinePatch(LINES, patch({ fix: [{ match: { text: "Take that!", pageIndex: 1 }, speaker: "chr_pepper" }] }), CAST);
    expect(byPage.speakerOverrides).toEqual(new Map([[5, "chr_pepper"]]));
    const byNth = applyLinePatch(LINES, patch({ fix: [{ match: { text: "Take that!", nth: 1 }, speaker: "chr_carrot" }] }), CAST);
    expect(byNth.speakerOverrides).toEqual(new Map([[2, "chr_carrot"]]));
  });

  it("fails loudly: unknown text, unknown speaker, speaker on an sfx or narration line, double fix", () => {
    expect(() => applyLinePatch(LINES, patch({ fix: [{ match: "Not there" }] }), CAST)).toThrow(/no line with text "Not there"/);
    expect(() => applyLinePatch(LINES, patch({ fix: [{ match: "Amateur!", speaker: "chr_nobody" }] }), CAST)).toThrow(/not a known cast id/);
    expect(() => applyLinePatch(LINES, patch({ fix: [{ match: "BOOM", speaker: "chr_pepper" }] }), CAST)).toThrow(/sfx line has no speaker/);
    expect(() => applyLinePatch(LINES, patch({ fix: [{ match: "Night falls.", speaker: "chr_pepper" }] }), CAST)).toThrow(/narration line has no speaker/);
    expect(() => applyLinePatch(LINES, patch({ fix: [{ match: "Amateur!", emotion: "sad" }, { match: "amateur", delivery: "shout" }] }), CAST)).toThrow(/fixed twice/);
  });
});

describe("applyLinePatch: remove", () => {
  it("drops the line and renumbers the rest", () => {
    const out = applyLinePatch(LINES, patch({ remove: ["BOOM"] }), CAST);
    expect(texts(out.lines)).toEqual(["1:Night falls.", "2:Take that!", "3:Amateur!", "4:Take that!"]);
    expect(out.summary.removed).toBe(1);
  });
  it("cannot also fix the removed line", () => {
    expect(() => applyLinePatch(LINES, patch({ remove: ["BOOM"], fix: [{ match: "BOOM", emotion: "sad" }] }), CAST)).toThrow(/also removed/);
  });
});

describe("applyLinePatch: add", () => {
  it("puts a new line where its box falls in the page's reading order, with the neighbour's mood", () => {
    const out = applyLinePatch(
      LINES,
      patch({ add: [{ pageIndex: 0, box: box(0.35), kind: "speech", text: "Not so fast!", speaker: "chr_pepper", delivery: "shout" }] }),
      CAST,
    );
    expect(texts(out.lines)).toEqual(["1:Night falls.", "2:Take that!", "3:BOOM", "4:Not so fast!", "5:Amateur!", "6:Take that!"]);
    expect(out.lines[3]).toMatchObject({ kind: "speech", speakerCastId: "chr_pepper", delivery: "shout", emotion: "neutral", sfxTag: null });
    expect(out.speakerOverrides).toEqual(new Map([[4, "chr_pepper"]]));
    // the override follows the line to its new order, and the lines after it moved down
    expect(out.lines[4]).toMatchObject({ text: "Amateur!", order: 5, mood: "battle", intensity: 3 });
  });

  it("puts a line at the end of the page, or on a page that has no lines yet, in page order", () => {
    const out = applyLinePatch(
      LINES,
      patch({
        add: [
          { pageIndex: 0, box: box(0.9), kind: "narration", text: "End of page 0" },
          { pageIndex: 3, box: box(0.1), kind: "narration", text: "Page 3" },
          { pageIndex: 2, box: box(0.1), kind: "narration", text: "Page 2" },
        ],
      }),
      CAST,
    );
    expect(out.lines.map((l) => `${l.pageIndex}:${l.text}`)).toEqual(["0:Night falls.", "0:Take that!", "0:BOOM", "0:Amateur!", "0:End of page 0", "1:Take that!", "2:Page 2", "3:Page 3"]);
  });

  it("honours `after`, and keeps several lines after the same anchor in file order", () => {
    const out = applyLinePatch(
      LINES,
      patch({
        add: [
          { pageIndex: 0, box: box(0.95), kind: "speech", text: "First", after: "Night falls." },
          { pageIndex: 0, box: box(0.05), kind: "speech", text: "Second", after: "Night falls." },
        ],
      }),
      CAST,
    );
    expect(texts(out.lines).slice(0, 4)).toEqual(["1:Night falls.", "2:First", "3:Second", "4:Take that!"]);
  });

  it("refuses a speaker on an sfx line and an unknown cast id", () => {
    expect(() => applyLinePatch(LINES, patch({ add: [{ pageIndex: 0, box: box(0.5), kind: "sfx", text: "Tok!", speaker: "chr_pepper" }] }), CAST)).toThrow(/sfx line has no speaker/);
    expect(() => applyLinePatch(LINES, patch({ add: [{ pageIndex: 0, box: box(0.5), kind: "speech", text: "Hi", speaker: "chr_x" }] }), CAST)).toThrow(/not a known cast id/);
  });

  it("adds an sfx with its tag", () => {
    const out = applyLinePatch(LINES, patch({ add: [{ pageIndex: 1, box: box(0.5), kind: "sfx", text: "Tok!", sfxTag: "footsteps" }] }), CAST);
    expect(out.lines.at(-1)).toMatchObject({ text: "Tok!", kind: "sfx", sfxTag: "footsteps", order: 6 });
  });

  it("gives every line a unique, increasing order", () => {
    const out = applyLinePatch(
      LINES,
      patch({
        remove: ["BOOM"],
        add: [{ pageIndex: 0, box: box(0.3), kind: "speech", text: "Hey" }],
        fix: [{ match: "Amateur!", text: "Amateurs!" }],
      }),
      CAST,
    );
    expect(out.lines.map((l) => l.order)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("patch file schema", () => {
  it("rejects a misspelled key instead of ignoring it", () => {
    expect(ChapterPatchSchema.safeParse({ fix: [{ match: "Hi", speker: "chr_pepper" }] }).success).toBe(false);
    expect(ChapterPatchSchema.safeParse({ ad: [] }).success).toBe(false);
  });
  it("rejects a box that is not x0<x1, y0<y1", () => {
    expect(ChapterPatchSchema.safeParse({ add: [{ pageIndex: 0, box: { x0: 0.5, y0: 0.1, x1: 0.2, y1: 0.2 }, kind: "speech", text: "x" }] }).success).toBe(false);
  });
  it("accepts the empty patch", () => {
    expect(ChapterPatchSchema.parse({})).toEqual({ add: [], fix: [], remove: [] });
  });

  const dirs: string[] = [];
  afterEach(async () => {
    while (dirs.length > 0) await rm(dirs.pop()!, { recursive: true, force: true });
  });
  it("loadPatch names the file and the bad field", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "patch-"));
    dirs.push(dir);
    const file = path.join(dir, "p.json");
    await writeFile(file, JSON.stringify({ fix: [{ match: "Hi", emotion: "furious" }] }));
    await expect(loadPatch(file)).rejects.toThrow(/--patch .*p\.json: fix\.0\.emotion/);
    await writeFile(file, "{oops");
    await expect(loadPatch(file)).rejects.toThrow(/--patch .*p\.json/);
    await writeFile(file, JSON.stringify({ remove: ["x"] }));
    expect((await loadPatch(file)).remove).toEqual([{ text: "x" }]);
  });
});

describe("applySpeakerOverrides", () => {
  const reasoning: ReasoningResult = {
    speakers: [
      { order: 2, speaker: "new_1" },
      { order: 4, speaker: "new_2" },
    ],
    newCharacters: [
      { key: "new_1", name: "A", description: "a", voiceSlot: "female_young" },
      { key: "new_2", name: "B", description: "b", voiceSlot: "male_adult" },
    ],
    regions: [{ startOrder: 1, endOrder: 5, mood: "calm", intensity: 1 }],
    recap: "Things happen.",
  };
  it("replaces the model's speaker and leaves the rest", () => {
    const out = applySpeakerOverrides(reasoning, new Map([[4, "chr_carrot"]]));
    expect(out.speakers).toEqual([
      { order: 2, speaker: "new_1" },
      { order: 4, speaker: "chr_carrot" },
    ]);
    expect(reasoning.speakers[1]!.speaker).toBe("new_2");
  });
  it("adds an entry the model left out, in order, and returns the input untouched when there is nothing to force", () => {
    expect(applySpeakerOverrides(reasoning, new Map([[3, "chr_pepper"]])).speakers.map((s) => s.order)).toEqual([2, 3, 4]);
    expect(applySpeakerOverrides(reasoning, new Map())).toBe(reasoning);
  });
});

describe("fixtures/cast/pepper-carrot.json", () => {
  const file = fileURLToPath(new URL("../../../fixtures/cast/pepper-carrot.json", import.meta.url));
  it("loads as a --cast file with the four pinned characters", async () => {
    const { seriesId, cast } = await loadCastFromPackages([file]);
    expect(seriesId).toBe("series_pepper_carrot");
    expect(cast.map((c) => c.id).sort()).toEqual(["chr_carrot", "chr_cayenne", "chr_elder_witch", "chr_pepper"]);
    for (const c of cast) {
      const profile = DEFAULT_PROFILES.find((p) => p.id === c.profileId);
      expect(profile?.slot, `${c.id} profileId ${c.profileId}`).toBe(c.voiceSlot);
      expect(c.seriesId).toBe(seriesId);
    }
  });
});

describe("a patch only costs TTS for new or changed lines", () => {
  it("leaves the voice, style and text of untouched lines identical", async () => {
    const { cast } = await loadCastFromPackages([fileURLToPath(new URL("../../../fixtures/cast/pepper-carrot.json", import.meta.url))]);
    const base: MergedLine[] = [
      line(1, "narration", "Night falls."),
      line(2, "speech", "Take that!", { speakerCastId: "chr_pepper" }),
      line(3, "speech", "Meow.", { speakerCastId: "chr_pepper" }),
      line(4, "speech", "Amateur!", { speakerCastId: "chr_cayenne" }),
    ];
    const speakers = new Map<string, string | null>([["Take that!", "chr_pepper"], ["Meow.", "chr_pepper"], ["Amateur!", "chr_cayenne"]]);
    const cuesOf = (lines: MergedLine[], overrides: Map<number, string | null>): Pick<Cue, "id" | "kind" | "characterId" | "emotion" | "delivery" | "order" | "text">[] =>
      lines.map((l) => ({
        id: `c${l.order}`,
        order: l.order,
        kind: l.kind,
        text: l.text,
        emotion: l.emotion,
        delivery: l.delivery,
        characterId: l.kind === "speech" ? (overrides.has(l.order) ? overrides.get(l.order)! : (speakers.get(l.text) ?? null)) : null,
      }));
    const clipKeys = (cues: ReturnType<typeof cuesOf>) =>
      planClips({ chapterId: "ch", cues: cues as unknown as Cue[], recap: { text: "Recap." } }, cast as never, DEFAULT_PROFILES)
        .filter((p) => p.cueId !== null)
        .map((p) => `${p.spec.voice}|${p.spec.style}|${p.text}`);

    const before = new Set(clipKeys(cuesOf(base, new Map())));
    const patched = applyLinePatch(
      base,
      patch({
        fix: [{ match: "Meow.", speaker: "chr_carrot" }],
        add: [{ pageIndex: 0, box: box(0.55), kind: "speech", text: "Not so fast!", speaker: "chr_pepper" }],
      }),
      cast,
    );
    const after = clipKeys(cuesOf(patched.lines, patched.speakerOverrides));
    const toVoice = after.filter((k) => !before.has(k));
    expect(toVoice).toHaveLength(2);
    expect(toVoice.some((k) => k.endsWith("|Meow."))).toBe(true);
    expect(toVoice.some((k) => k.endsWith("|Not so fast!"))).toBe(true);
    expect(after.filter((k) => before.has(k))).toHaveLength(3);
  });
});
