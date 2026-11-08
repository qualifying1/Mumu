// Pure logic for the Home screen (F5): which chapter a series card shows, progress, search, carousel index.
// No DOM, no Dexie: unit-tested in homeModel.test.ts.
import type { Chapter, Series } from "../db/db.ts";

/** Rough reading pace used for the "N min left" label (no audio durations are known for unprocessed chapters). */
export const MINUTES_PER_PAGE = 0.5;

export interface ShelfEntry {
  series: Series;
  /** The chapter the card offers to read, or null when the series has no chapters. */
  chapter: Chapter | null;
  /** 0..1 progress through `chapter`. */
  progress: number;
  minutesLeft: number;
}

/** Fraction of a chapter read; `lastReadY` is page units (pageIndex + fraction, see reader/coords.ts). */
export function chapterProgress(chapter: Pick<Chapter, "pageCount" | "lastReadY">): number {
  if (chapter.pageCount <= 0 || chapter.lastReadY === undefined) return 0;
  return Math.min(1, Math.max(0, chapter.lastReadY / chapter.pageCount));
}

export function minutesLeft(chapter: Pick<Chapter, "pageCount" | "lastReadY">): number {
  const pagesLeft = chapter.pageCount * (1 - chapterProgress(chapter));
  return Math.max(0, Math.ceil(pagesLeft * MINUTES_PER_PAGE));
}

/** A chapter counts as finished once you've scrolled through its last page. */
function isFinished(chapter: Pick<Chapter, "pageCount" | "lastReadY">): boolean {
  return chapterProgress(chapter) >= 1;
}

/**
 * The chapter a series card shows: the one you're part-way through, else the first unfinished one,
 * else (everything read) the latest chapter.
 */
export function currentChapter(chapters: readonly Chapter[]): Chapter | null {
  if (chapters.length === 0) return null;
  const byNumber = [...chapters].sort((a, b) => a.number - b.number);
  const inProgress = byNumber.find((c) => chapterProgress(c) > 0 && !isFinished(c));
  if (inProgress) return inProgress;
  return byNumber.find((c) => !isFinished(c)) ?? byNumber[byNumber.length - 1]!;
}

export function buildShelf(series: readonly Series[], chapters: readonly Chapter[]): ShelfEntry[] {
  return [...series]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((s) => {
      const chapter = currentChapter(chapters.filter((c) => c.seriesId === s.id));
      return {
        series: s,
        chapter,
        progress: chapter ? chapterProgress(chapter) : 0,
        minutesLeft: chapter ? minutesLeft(chapter) : 0,
      };
    });
}

/** Case-insensitive substring match on the series title; a blank query keeps everything. */
export function filterShelf(entries: readonly ShelfEntry[], query: string): ShelfEntry[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...entries];
  return entries.filter((e) => e.series.title.toLowerCase().includes(q));
}

/** Which card is centred in a snap carousel, from its scroll offset. Clamped to the valid range. */
export function indexFromScroll(scrollLeft: number, cardStride: number, count: number): number {
  if (count <= 0 || !(cardStride > 0)) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / cardStride)));
}
