import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { planSegments, sliceChapter, SEGMENT_OVERLAP } from "./slice.js";

describe("planSegments", () => {
  it("keeps a short page as one segment", () => {
    expect(planSegments(800, 1400)).toEqual([{ top: 0, height: 1400 }]);
    expect(planSegments(800, 1600)).toEqual([{ top: 0, height: 1600 }]);
  });

  it("cuts a tall page into 1.5–2× bands that cover it with ~12% overlap", () => {
    for (const height of [3200, 4000, 6000, 9000, 12000]) {
      const segs = planSegments(800, height);
      expect(segs.length).toBeGreaterThan(1);
      expect(segs[0]!.top).toBe(0);
      const last = segs.at(-1)!;
      expect(last.top + last.height).toBe(height);
      for (const s of segs) {
        expect(s.height).toBeLessThanOrEqual(1600);
        expect(s.height).toBeGreaterThanOrEqual(1200);
      }
      for (let i = 1; i < segs.length; i++) {
        const prev = segs[i - 1]!;
        const overlap = prev.top + prev.height - segs[i]!.top;
        expect(overlap / prev.height).toBeGreaterThanOrEqual(SEGMENT_OVERLAP - 0.01);
      }
    }
  });

  it("holds the 1.5–2× and ≥12% overlap rules for every page height", () => {
    for (let height = 1601; height <= 20000; height += 7) {
      const segs = planSegments(800, height);
      expect(segs.length).toBeGreaterThan(1);
      expect(segs[0]!.top).toBe(0);
      expect(segs.at(-1)!.top + segs.at(-1)!.height).toBe(height);
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i]!;
        expect(s.height).toBeGreaterThanOrEqual(1200);
        expect(s.height).toBeLessThanOrEqual(1600);
        if (i > 0) {
          const prev = segs[i - 1]!;
          expect((prev.top + prev.height - s.top) / s.height).toBeGreaterThanOrEqual(SEGMENT_OVERLAP - 0.01);
        }
      }
    }
  });

  it("has no gaps: each band starts before the previous one ends", () => {
    const segs = planSegments(800, 7777);
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
