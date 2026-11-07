import { BoxSchema, CueKindSchema, DeliverySchema, EmotionSchema, SfxTagSchema, type Character } from "@mumu/shared";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { normalizeText, readingOrder, type MergedLine } from "./merge.js";
import type { ReasoningResult } from "./reasonSchema.js";

/**
 * Hand-fix patch for the demo chapters (`--patch <file.json>` on the fixture CLI).
 *
 * The patch is applied to the merged transcript BEFORE the reasoning pass (so the model sees the
 * complete chapter and orders are renumbered), and its speaker choices are forced onto the
 * reasoning result AFTER it (so the model cannot overrule them). TTS needs nothing special: clips
 * are cached by voice + style + text, so only added lines, changed text and changed speakers
 * cost a TTS call.
 *
 * Example:
 * {
 *   "add": [{ "pageIndex": 4, "box": { "x0": 0.1, "y0": 0.2, "x1": 0.4, "y1": 0.26 }, "kind": "speech", "text": "Not so fast!", "speaker": "chr_pepper" }],
 *   "fix": [{ "match": "Amateur!", "speaker": "chr_carrot" }, { "match": { "text": "HERE!", "pageIndex": 6 }, "delivery": "shout" }],
 *   "remove": ["Tok!"]
 * }
 */

/** Which line a fix/remove/after refers to: its text (letters and digits, case-insensitive), narrowed by page or occurrence. */
const LocatorSchema = z.union([
  z.string().min(1).transform((text) => ({ text })),
  z
    .object({
      text: z.string().min(1),
      /** 0-based page, when the same text appears on several pages. */
      pageIndex: z.number().int().min(0).optional(),
      /** 1-based occurrence among the matches (after the page filter), when the text still repeats. */
      nth: z.number().int().min(1).optional(),
    })
    .strict(),
]);
export interface Locator {
  text: string;
  pageIndex?: number | undefined;
  nth?: number | undefined;
}

/** A known cast id, or null for "unknown speaker" (the line is voiced by the narrator). */
const SpeakerSchema = z.string().min(1).nullable();

const AddSchema = z
  .object({
    pageIndex: z.number().int().min(0),
    /** Page fractions (CONTRACT §1), like every other box. */
    box: BoxSchema,
    kind: CueKindSchema,
    text: z.string().min(1),
    speaker: SpeakerSchema.optional(),
    emotion: EmotionSchema.default("neutral"),
    delivery: DeliverySchema.default("normal"),
    sfxTag: SfxTagSchema.nullable().default(null),
    speakerHint: z.string().min(1).nullable().default(null),
    /** Put the line right after this one. Without it, the line goes where its box falls in the page's reading order. */
    after: LocatorSchema.optional(),
  })
  .strict();

const FixSchema = z
  .object({
    match: LocatorSchema,
    text: z.string().min(1).optional(),
    kind: CueKindSchema.optional(),
    speaker: SpeakerSchema.optional(),
    emotion: EmotionSchema.optional(),
    delivery: DeliverySchema.optional(),
    sfxTag: SfxTagSchema.nullable().optional(),
  })
  .strict();

export const ChapterPatchSchema = z
  .object({
    add: z.array(AddSchema).default([]),
    fix: z.array(FixSchema).default([]),
    remove: z.array(LocatorSchema).default([]),
  })
  .strict();
export type ChapterPatch = z.output<typeof ChapterPatchSchema>;

export async function loadPatch(file: string): Promise<ChapterPatch> {
  let json: unknown;
  try {
    json = JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    throw new Error(`--patch ${file}: ${(err as Error).message}`);
  }
  const parsed = ChapterPatchSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`--patch ${file}: ${issue?.path.join(".") || "(root)"}: ${issue?.message}`);
  }
  return parsed.data;
}

export interface PatchSummary {
  added: number;
  fixed: number;
  removed: number;
}

export interface PatchedTranscript {
  lines: MergedLine[];
  /** New line order -> the speaker the patch demands (a cast id, or null for unknown). */
  speakerOverrides: Map<number, string | null>;
  summary: PatchSummary;
}

type Work = Omit<MergedLine, "order"> & { added: boolean };

const describe = (loc: Locator) => `"${loc.text}"${loc.pageIndex !== undefined ? ` on page ${loc.pageIndex}` : ""}${loc.nth !== undefined ? ` (#${loc.nth})` : ""}`;

function locate(lines: readonly MergedLine[], loc: Locator, where: string): MergedLine {
  const want = normalizeText(loc.text);
  if (want === "") throw new Error(`patch ${where}: ${describe(loc)} has no letters or digits to match on`);
  const hits = lines.filter((l) => normalizeText(l.text) === want && (loc.pageIndex === undefined || l.pageIndex === loc.pageIndex));
  if (hits.length === 0) throw new Error(`patch ${where}: no line with text ${describe(loc)} in the transcript`);
  if (loc.nth !== undefined) {
    const hit = hits[loc.nth - 1];
    if (!hit) throw new Error(`patch ${where}: ${describe(loc)} has only ${hits.length} match(es)`);
    return hit;
  }
  if (hits.length > 1) {
    const where2 = hits.map((h) => `order ${h.order} (page ${h.pageIndex})`).join(", ");
    throw new Error(`patch ${where}: ${describe(loc)} matches ${hits.length} lines (${where2}); add "pageIndex" or "nth"`);
  }
  return hits[0]!;
}

function checkSpeaker(speaker: string | null | undefined, kind: Work["kind"], cast: readonly Pick<Character, "id">[], where: string): void {
  if (speaker === undefined) return;
  if (speaker !== null && kind !== "speech" && kind !== "thought") throw new Error(`patch ${where}: a ${kind} line has no speaker (only speech and thought lines do)`);
  if (speaker !== null && !cast.some((c) => c.id === speaker)) {
    throw new Error(`patch ${where}: speaker "${speaker}" is not a known cast id (known: ${cast.map((c) => c.id).join(", ") || "none"})`);
  }
}

/**
 * Remove, fix and add lines. Locators are resolved against the transcript as the pipeline produced
 * it, never against the half-patched one, so the order of entries in the file does not matter.
 */
export function applyLinePatch(original: readonly MergedLine[], patch: ChapterPatch, cast: readonly Pick<Character, "id">[]): PatchedTranscript {
  const works = new Map<MergedLine, Work>(original.map((line): [MergedLine, Work] => {
    const { order: _order, ...rest } = line;
    return [line, { ...rest, added: false }];
  }));
  const overrides = new Map<Work, string | null>();

  const removed = new Set<MergedLine>();
  patch.remove.forEach((loc, i) => removed.add(locate(original, loc, `remove[${i}]`)));

  const fixed = new Set<MergedLine>();
  patch.fix.forEach((fix, i) => {
    const where = `fix[${i}]`;
    const target = locate(original, fix.match, where);
    if (removed.has(target)) throw new Error(`patch ${where}: ${describe(fix.match)} is also removed`);
    if (fixed.has(target)) throw new Error(`patch ${where}: ${describe(fix.match)} is fixed twice; merge the entries`);
    fixed.add(target);
    const work = works.get(target)!;
    if (fix.text !== undefined) work.text = fix.text;
    if (fix.kind !== undefined) work.kind = fix.kind;
    if (fix.emotion !== undefined) work.emotion = fix.emotion;
    if (fix.delivery !== undefined) work.delivery = fix.delivery;
    if (fix.sfxTag !== undefined) work.sfxTag = fix.sfxTag;
    if (work.kind !== "sfx") work.sfxTag = null;
    checkSpeaker(fix.speaker, work.kind, cast, where);
    if (fix.speaker !== undefined) {
      work.speakerCastId = fix.speaker;
      overrides.set(work, fix.speaker);
    }
  });

  const seq: Work[] = original.filter((l) => !removed.has(l)).map((l) => works.get(l)!);
  const lastAfter = new Map<Work, Work>();

  patch.add.forEach((add, i) => {
    const where = `add[${i}]`;
    checkSpeaker(add.speaker, add.kind, cast, where);
    const work: Work = {
      kind: add.kind,
      pageIndex: add.pageIndex,
      box: add.box,
      text: add.text,
      emotion: add.emotion,
      delivery: add.delivery,
      speakerHint: add.speakerHint,
      speakerCastId: add.speaker ?? null,
      sfxTag: add.kind === "sfx" ? add.sfxTag : null,
      // mood and intensity are copied from the neighbour below
      mood: "calm",
      intensity: 1,
      added: true,
    };
    if (add.speaker !== undefined) overrides.set(work, add.speaker);

    let at: number;
    if (add.after) {
      const anchorLine = locate(original, add.after, `${where}.after`);
      if (removed.has(anchorLine)) throw new Error(`patch ${where}.after: ${describe(add.after)} is removed`);
      const anchor = works.get(anchorLine)!;
      at = seq.indexOf(lastAfter.get(anchor) ?? anchor) + 1;
      lastAfter.set(anchor, work);
    } else {
      at = positionByReadingOrder(seq, work);
    }
    seq.splice(at, 0, work);
  });

  if (seq.length === 0) throw new Error("patch: the transcript would be empty after the removals");
  seq.forEach((w, i) => {
    if (!w.added) return;
    const neighbour = seq[i - 1] ?? seq[i + 1] ?? w;
    w.mood = neighbour.mood;
    w.intensity = neighbour.intensity;
  });

  const speakerOverrides = new Map<number, string | null>();
  const lines = seq.map(({ added: _a, ...rest }, i): MergedLine => {
    if (overrides.has(seq[i]!)) speakerOverrides.set(i + 1, overrides.get(seq[i]!)!);
    return { ...rest, order: i + 1 };
  });
  return { lines, speakerOverrides, summary: { added: patch.add.length, fixed: fixed.size, removed: removed.size } };
}

/** Where a new line goes so that its page stays in reading order: before the next line in that order, or after the previous. */
function positionByReadingOrder(seq: readonly Work[], work: Work): number {
  const onPage = seq.filter((w) => w.pageIndex === work.pageIndex);
  if (onPage.length > 0) {
    const sorted = readingOrder([...onPage, work]);
    const i = sorted.indexOf(work);
    const next = sorted[i + 1];
    if (next) return seq.indexOf(next);
    return seq.indexOf(sorted[i - 1]!) + 1;
  }
  const later = seq.findIndex((w) => w.pageIndex > work.pageIndex);
  return later === -1 ? seq.length : later;
}

/**
 * Force the patch's speakers onto the reasoning result. Only speech and thought lines carry a
 * speaker entry; the patch has already been checked to name only those, but a line the reasoning
 * pass left out is added here so the draft is always complete.
 */
export function applySpeakerOverrides(reasoning: ReasoningResult, overrides: ReadonlyMap<number, string | null>): ReasoningResult {
  if (overrides.size === 0) return reasoning;
  const speakers = reasoning.speakers.map((s) => (overrides.has(s.order) ? { order: s.order, speaker: overrides.get(s.order)! } : s));
  for (const [order, speaker] of overrides) {
    if (!speakers.some((s) => s.order === order)) speakers.push({ order, speaker });
  }
  speakers.sort((a, b) => a.order - b.order);
  return { ...reasoning, speakers };
}
