import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { planSegments, sliceChapter, SEGMENT_MAX_RATIO, SEGMENT_MIN_RATIO, SEGMENT_OVERLAP } from "./slice.js";

const W = 800;
const MAX = Math.floor(W * SEGMENT_MAX_RATIO);
const MIN = Math.ceil(W * SEGMENT_MIN_RATIO);

describe("planSegments", () => {
  it("keeps a page up to MAX× its width as one segment", () => {
    expect(planSegments(W, 700)).toEqual([{ top: 0, height: 700 }]);
    expect(planSegments(W, MAX)).toEqual([{ top: 0, height: MAX }]);
  });

  it("cuts a 1200x1660 page into two bands about 0.75x as tall as wide, with 12% overlap", () => {
    const segs = planSegments(1200, 1660);
    expect(segs).toEqual([
      { top: 0, height: 883 },
      { top: 777, height: 883 },
    ]);
  });

  it("cuts a tall page into ~1× bands that cover it with ~12% overlap", () => {
    for (const height of [3200, 4000, 6000, 9000, 12000]) {
      const segs = planSegments(W, height);
      expect(segs.length).toBeGreaterThan(1);
      expect(segs[0]!.top).toBe(0);
      const last = segs.at(-1)!;
      expect(last.top + last.height).toBe(height);
      for (const s of segs) {
        expect(s.height).toBeLessThanOrEqual(MAX);
        expect(s.height).toBeGreaterThanOrEqual(MIN);
      }
      for (let i = 1; i < segs.length; i++) {
        const prev = segs[i - 1]!;
        const overlap = prev.top + prev.height - segs[i]!.top;
        expect(overlap / prev.height).toBeGreaterThanOrEqual(SEGMENT_OVERLAP - 0.01);
      }
    }
  });

  it("holds the band-height and ≥12% overlap rules for every page height", () => {
    for (let height = MAX + 1; height <= 20000; height += 7) {
      const segs = planSegments(W, height);
      expect(segs.length).toBeGreaterThan(1);
      expect(segs[0]!.top).toBe(0);
      expect(segs.at(-1)!.top + segs.at(-1)!.height).toBe(height);
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i]!;
        expect(s.height).toBeGreaterThanOrEqual(MIN);
        expect(s.height).toBeLessThanOrEqual(MAX);
        if (i > 0) {
          const prev = segs[i - 1]!;
          expect((prev.top + prev.height - s.top) / s.height).toBeGreaterThanOrEqual(SEGMENT_OVERLAP - 0.01);
        }
      }
    }
  });

  it("has no gaps: each band starts before the previous one ends", () => {
    const segs = planSegments(W, 7777);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i]!.top).toBeLessThan(segs[i - 1]!.top + segs[i - 1]!.height);
    }
  });

  it("rejects bad dimensions", () => {
    expect(() => planSegments(0, 100)).toThrow(/positive integer/);
    expect(() => planSegments(800.5, 100)).toThrow(/positive integer/);
  });
});

describe("sliceChapter", () => {
  it("numbers segments across pages in reading order and crops real bytes", async () => {
    const page = (h: number) =>
      sharp({ create: { width: 400, height: h, channels: 3, background: "#888" } }).jpeg().toBuffer();
    const segments = await sliceChapter([{ bytes: await page(600) }, { bytes: await page(2000) }]);
    expect(segments.map((s) => s.index)).toEqual(segments.map((_, i) => i));
    expect(segments[0]!.pageIndex).toBe(0);
    expect(segments.at(-1)!.pageIndex).toBe(1);
    for (const s of segments) {
      const meta = await sharp(s.image).metadata();
      expect(meta.width).toBe(400);
      expect(meta.height).toBe(s.height);
    }
  });
});
