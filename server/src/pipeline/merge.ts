import type { Box, CueKind, Delivery, Emotion, Intensity, Mood, SfxTag } from "@mumu/shared";
import type { RawSegmentResult } from "./vision.js";

/** One line of the chapter transcript, after mapping, dedupe and ordering. */
export interface MergedLine {
  /** 1-based, unique, strictly increasing: the speaking order the client plays by. */
  order: number;
  kind: CueKind;
  pageIndex: number;
  /** Page fractions (CONTRACT §1). */
  box: Box;
  text: string;
  emotion: Emotion;
  delivery: Delivery;
  speakerHint: string | null;
  speakerCastId: string | null;
  sfxTag: SfxTag | null;
  /** Mood/intensity of the segment the line was read from (input to the reasoning pass). */
  mood: Mood;
  intensity: Intensity;
}

type Segment = RawSegmentResult["segment"];
type Unordered = Omit<MergedLine, "order"> & { segmentIndex: number; segmentEdgeDistance: number };

/** Smallest box edge so a degenerate model box still satisfies BoxSchema (x0 < x1, y0 < y1). */
const MIN_EXTENT = 0.001;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Vision box `[ymin, xmin, ymax, xmax]` (0–1000, relative to the segment) -> page fractions.
 * The segment is a full-width band of the page, so x maps directly and y adds the band's top.
 */
export function mapBox(segment: Pick<Segment, "top" | "height" | "pageHeight">, box: readonly number[]): Box {
  const [ymin, xmin, ymax, xmax] = box as [number, number, number, number];
  let y0 = clamp01((segment.top + (ymin / 1000) * segment.height) / segment.pageHeight);
  let y1 = clamp01((segment.top + (ymax / 1000) * segment.height) / segment.pageHeight);
  let x0 = clamp01(xmin / 1000);
  let x1 = clamp01(xmax / 1000);
  if (y1 - y0 < MIN_EXTENT) (y1 = Math.min(1, y0 + MIN_EXTENT)), (y0 = y1 - MIN_EXTENT);
  if (x1 - x0 < MIN_EXTENT) (x1 = Math.min(1, x0 + MIN_EXTENT)), (x0 = x1 - MIN_EXTENT);
  return { x0, y0, x1, y1 };
}

/** Lowercase letters and digits only, for comparing the same text read twice. */
export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

const area = (b: Box) => (b.x1 - b.x0) * (b.y1 - b.y0);

/** Intersection area divided by the smaller box's area (1 = one box lies inside the other). */
export function overlapOfSmaller(a: Box, b: Box): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(area(a), area(b));
}

/** Two boxes with this much overlap, from different segments and with the same text, are one bubble. */
export const DUPLICATE_OVERLAP = 0.5;
/** Texts shorter than this must match exactly; longer ones may match as a cut-off prefix/suffix. */
const MIN_PARTIAL_LENGTH = 3;

function sameText(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na === "" || nb === "") return false;
  if (na === nb) return true;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  return short.length >= MIN_PARTIAL_LENGTH && long.includes(short);
}

function isDuplicate(a: Unordered, b: Unordered): boolean {
  return (
    a.segmentIndex !== b.segmentIndex &&
    a.pageIndex === b.pageIndex &&
    sameText(a.text, b.text) &&
    overlapOfSmaller(a.box, b.box) >= DUPLICATE_OVERLAP
  );
}

/** Which of two duplicates to keep: the fuller text, then the one farther from its slice edge. */
function better(candidate: Unordered, current: Unordered): boolean {
  const lc = normalizeText(candidate.text).length;
  const lk = normalizeText(current.text).length;
  if (lc !== lk) return lc > lk;
  return candidate.segmentEdgeDistance > current.segmentEdgeDistance;
}

/** 0 at the top/bottom edge of the slice, 0.5 in the middle. Items cut off at an edge read worse. */
function edgeDistance(segment: Segment, box: readonly number[]): number {
  const ymin = box[0]!;
  const ymax = box[2]!;
  // Page edges aren't slice cuts: only count an edge that is inside the page.
  const topIsCut = segment.top > 0;
  const bottomIsCut = segment.top + segment.height < segment.pageHeight;
  const fromTop = topIsCut ? ymin / 1000 : 1;
  const fromBottom = bottomIsCut ? 1 - ymax / 1000 : 1;
  return Math.min(fromTop, fromBottom);
}

/** Fraction of the shorter box's height that the two boxes share vertically. */
function verticalShare(a: Box, b: Box): number {
  const shared = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (shared <= 0) return 0;
  return shared / Math.min(a.y1 - a.y0, b.y1 - b.y0);
}

/** Two boxes sit in the same row when they share at least this much of the shorter one's height. */
export const ROW_SHARE = 0.5;

/**
 * Reading order for one page's items: rows from top to bottom, left to right within a row.
 * Items are visited by vertical centre; an item joins the current row when it shares
 * {@link ROW_SHARE} of height with the row's first item, otherwise it starts a new row.
 */
export function readingOrder<T extends { box: Box }>(items: readonly T[]): T[] {
  const byCentre = [...items].sort((a, b) => a.box.y0 + a.box.y1 - (b.box.y0 + b.box.y1) || a.box.x0 - b.box.x0);
  const rows: T[][] = [];
  for (const item of byCentre) {
    const row = rows[rows.length - 1];
    if (row && verticalShare(row[0]!.box, item.box) >= ROW_SHARE) row.push(item);
    else rows.push([item]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.box.x0 - b.box.x0 || a.box.y0 - b.box.y0));
}

/**
 * Raw per-segment vision results -> the chapter transcript:
 * boxes mapped to page fractions, overlap duplicates removed, one unique increasing `order`
 * (pages in order, then reading order within the page). Speaking order is fixed here, never at
 * play time (voices must not overlap).
 */
export function mergeSegments(raw: readonly RawSegmentResult[]): MergedLine[] {
  const kept: Unordered[] = [];
  for (const { segment, result } of [...raw].sort((a, b) => a.segment.index - b.segment.index)) {
    for (const item of result.items) {
      const candidate: Unordered = {
        kind: item.kind,
        pageIndex: segment.pageIndex,
        box: mapBox(segment, item.box),
        text: item.text,
        emotion: item.emotion,
        delivery: item.delivery,
        speakerHint: item.speakerHint,
        speakerCastId: item.speakerCastId,
        sfxTag: item.kind === "sfx" ? item.sfxTag : null,
        mood: result.mood,
        intensity: result.intensity,
        segmentIndex: segment.index,
        segmentEdgeDistance: edgeDistance(segment, item.box),
      };
      const dupAt = kept.findIndex((k) => isDuplicate(k, candidate));
      if (dupAt === -1) kept.push(candidate);
      else if (better(candidate, kept[dupAt]!)) kept[dupAt] = candidate;
    }
  }

  const pageIndexes = [...new Set(kept.map((k) => k.pageIndex))].sort((a, b) => a - b);
  const ordered = pageIndexes.flatMap((p) => readingOrder(kept.filter((k) => k.pageIndex === p)));
  return ordered.map(({ segmentIndex: _s, segmentEdgeDistance: _e, ...line }, i) => ({ ...line, order: i + 1 }));
}
