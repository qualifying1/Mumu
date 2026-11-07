import { describe, expect, it } from "vitest";
import type { Chapter, Series } from "../db/db.ts";
import { buildShelf, chapterProgress, currentChapter, filterShelf, indexFromScroll, minutesLeft } from "./homeModel.ts";

const ch = (id: string, seriesId: string, number: number, pageCount = 10, lastReadY?: number): Chapter => ({
  id,
  seriesId,
  number,
  title: `Chapter ${number}`,
  pageCount,
  status: "imported",
  ...(lastReadY === undefined ? {} : { lastReadY }),
});
const ser = (id: string, title: string, createdAt: number): Series => ({ id, title, coverPageId: `${id}:p0`, createdAt });

describe("progress", () => {
  it("is 0 when never read and clamps to 0..1", () => {
    expect(chapterProgress({ pageCount: 10 })).toBe(0);
    expect(chapterProgress({ pageCount: 10, lastReadY: 5 })).toBe(0.5);
    expect(chapterProgress({ pageCount: 10, lastReadY: 99 })).toBe(1);
    expect(chapterProgress({ pageCount: 0, lastReadY: 3 })).toBe(0);
  });
  it("estimates minutes left, rounding up", () => {
    expect(minutesLeft({ pageCount: 24 })).toBe(12);
    expect(minutesLeft({ pageCount: 24, lastReadY: 12 })).toBe(6);
    expect(minutesLeft({ pageCount: 3 })).toBe(2);
    expect(minutesLeft({ pageCount: 10, lastReadY: 10 })).toBe(0);
  });
});

describe("currentChapter", () => {
  it("is null for a series with no chapters", () => {
    expect(currentChapter([])).toBeNull();
  });
  it("prefers the chapter you're part-way through", () => {
    const list = [ch("a", "s", 1, 10, 10), ch("b", "s", 2, 10, 4), ch("c", "s", 3)];
    expect(currentChapter(list)?.id).toBe("b");
  });
  it("otherwise the first unfinished chapter by number", () => {
    const list = [ch("c", "s", 3), ch("a", "s", 1, 10, 10), ch("b", "s", 2)];
    expect(currentChapter(list)?.id).toBe("b");
  });
  it("falls back to the latest chapter when all are finished", () => {
    const list = [ch("a", "s", 1, 10, 10), ch("b", "s", 2, 10, 10)];
    expect(currentChapter(list)?.id).toBe("b");
  });
});

describe("buildShelf / filterShelf", () => {
  const series = [ser("s2", "Solo Leveling", 2), ser("s1", "Tower of God", 1)];
  const chapters = [ch("a", "s1", 1), ch("b", "s2", 1, 20, 10)];
  const shelf = buildShelf(series, chapters);

  it("orders by creation time and attaches the current chapter", () => {
    expect(shelf.map((e) => e.series.id)).toEqual(["s1", "s2"]);
    expect(shelf[1]!.chapter?.id).toBe("b");
    expect(shelf[1]!.progress).toBe(0.5);
  });
  it("handles a series with no chapters", () => {
    const [only] = buildShelf([ser("x", "Empty", 1)], []);
    expect(only!.chapter).toBeNull();
    expect(only!.minutesLeft).toBe(0);
  });
  it("filters by title, case-insensitively, and keeps all on a blank query", () => {
    expect(filterShelf(shelf, "SOLO").map((e) => e.series.id)).toEqual(["s2"]);
    expect(filterShelf(shelf, "  ").length).toBe(2);
    expect(filterShelf(shelf, "zzz")).toEqual([]);
  });
});

describe("indexFromScroll", () => {
  it("rounds to the nearest card and clamps", () => {
    expect(indexFromScroll(0, 300, 3)).toBe(0);
    expect(indexFromScroll(140, 300, 3)).toBe(0);
    expect(indexFromScroll(160, 300, 3)).toBe(1);
    expect(indexFromScroll(5000, 300, 3)).toBe(2);
    expect(indexFromScroll(-20, 300, 3)).toBe(0);
    expect(indexFromScroll(100, 0, 3)).toBe(0);
    expect(indexFromScroll(100, 300, 0)).toBe(0);
  });
});
