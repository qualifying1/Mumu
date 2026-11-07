import {
  CONTRACT_VERSION,
  CharacterSchema,
  CueSchema,
  ModelsSchema,
  RegionSchema,
  type Character,
  type Cue,
  type Models,
  type Region,
} from "@mumu/shared";
import { z } from "zod";
import type { MergedLine } from "./merge.js";
import type { ReasoningResult } from "./reasonSchema.js";

/**
 * A ChapterPackage before voicing (A2): same shape minus audio. Cues have `audioId: null` and
 * the recap has text only; A3 fills the audio and produces the full ChapterPackage.
 */
export const DraftPackageSchema = z
  .object({
    contractVersion: z.literal(CONTRACT_VERSION),
    seriesId: z.string().min(1),
    chapterId: z.string().min(1),
    models: ModelsSchema,
    newCharacters: z.array(CharacterSchema),
    cues: z.array(CueSchema),
    regions: z.array(RegionSchema),
    recap: z.object({ text: z.string().min(1) }),
  })
  .superRefine((pkg, ctx) => {
    pkg.cues.forEach((cue, i) => {
      if (i > 0 && cue.order <= pkg.cues[i - 1]!.order) {
        ctx.addIssue({ code: "custom", path: ["cues", i, "order"], message: "cues must be sorted by increasing order" });
      }
      if (cue.audioId !== null) ctx.addIssue({ code: "custom", path: ["cues", i, "audioId"], message: "a draft has no audio yet" });
    });
  });
export type DraftPackage = z.infer<typeof DraftPackageSchema>;

/** The anchor of a cue: the vertical centre of its box (CONTRACT §1). */
const anchorY = (cue: Pick<Cue, "box">) => (cue.box.y0 + cue.box.y1) / 2;

/**
 * Reasoning regions (by cue order) -> page positions. A region starts at the anchor of its first
 * cue; each region ends where the next begins (contiguous), the last at its last cue's anchor.
 * Neighbours with the same mood and intensity are joined.
 */
export function regionsFromOrders(
  regions: ReasoningResult["regions"],
  cues: readonly Pick<Cue, "order" | "pageIndex" | "box">[],
  chapterId: string,
): Region[] {
  const at = (order: number) => {
    const cue = cues.find((c) => c.order === order);
    if (!cue) throw new Error(`region refers to order ${order}, which is not a cue`);
    return { pageIndex: cue.pageIndex, y: anchorY(cue) };
  };

  const joined: ReasoningResult["regions"] = [];
  for (const r of regions) {
    const prev = joined[joined.length - 1];
    if (prev && prev.mood === r.mood && prev.intensity === r.intensity) joined[joined.length - 1] = { ...prev, endOrder: r.endOrder };
    else joined.push({ ...r });
  }

  return joined.map((r, i) => {
    const next = joined[i + 1];
    return {
      id: `reg_${chapterId}_${i + 1}`,
      start: at(r.startOrder),
      end: next ? at(next.startOrder) : at(r.endOrder),
      mood: r.mood,
      intensity: r.intensity,
    };
  });
}

/** Lines + reasoning + casting -> the draft package, validated before it is returned. */
export function assembleDraft(args: {
  seriesId: string;
  chapterId: string;
  models: Models;
  lines: readonly MergedLine[];
  reasoning: ReasoningResult;
  newCharacters: readonly Character[];
  /** reasoning key (`new_1`) -> character id */
  idByKey: ReadonlyMap<string, string>;
}): DraftPackage {
  const speakerByOrder = new Map(args.reasoning.speakers.map((s) => [s.order, s.speaker]));
  const cues: Cue[] = args.lines.map((l) => {
    const speaker = speakerByOrder.get(l.order) ?? null;
    return {
      id: `cue_${args.chapterId}_${l.order}`,
      order: l.order,
      kind: l.kind,
      pageIndex: l.pageIndex,
      box: l.box,
      text: l.text,
      characterId: speaker === null ? null : (args.idByKey.get(speaker) ?? speaker),
      emotion: l.emotion,
      delivery: l.delivery,
      audioId: null,
      sfxTag: l.kind === "sfx" ? l.sfxTag : null,
    };
  });

  return DraftPackageSchema.parse({
    contractVersion: CONTRACT_VERSION,
    seriesId: args.seriesId,
    chapterId: args.chapterId,
    models: args.models,
    newCharacters: args.newCharacters,
    cues,
    regions: regionsFromOrders(args.reasoning.regions, cues, args.chapterId),
    recap: { text: args.reasoning.recap },
  });
}
