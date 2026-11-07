import { describe, expect, it } from "vitest";
import {
  anchorY,
  boxToRect,
  computeLayout,
  pageUnitsToStripY,
  pageYToStrip,
  regionBounds,
  stripYToPageUnits,
} from "./coords.ts";

// Two pages: 1200×1600 (ratio 4/3) and 1200×2400 (ratio 2). At width 600 → heights 800 and 1200.
const layout = computeLayout(
  [
    { width: 1200, height: 1600 },
    { width: 1200, height: 2400 },
  ],
  600,
);

describe("computeLayout", () => {
  it("stacks pages using aspect ratios", () => {
    expect(layout.heights).toEqual([800, 1200]);
    expect(layout.offsets).toEqual([0, 800]);
    expect(layout.total).toBe(2000);
  });

  it("scales with the strip width", () => {
    const narrow = computeLayout([{ width: 1200, height: 1600 }], 390);
    expect(narrow.heights[0]).toBeCloseTo(520);
  });

  it("rejects a bad width or page", () => {
    expect(() => computeLayout([], 0)).toThrow(/width/);
    expect(() => computeLayout([{ width: 0, height: 10 }], 100)).toThrow(/invalid dimensions/);
  });
});

describe("fractions to pixels", () => {
  it("maps a page fraction to strip px", () => {
    expect(pageYToStrip(layout, 0, 0.5)).toBe(400);
    expect(pageYToStrip(layout, 1, 0.25)).toBe(800 + 300);
  });

  it("throws for a page outside the chapter", () => {
    expect(() => pageYToStrip(layout, 2, 0.1)).toThrow(/outside the chapter/);
  });

  it("anchor is the vertical centre of the box", () => {
    expect(anchorY(layout, 1, { x0: 0.1, y0: 0.1, x1: 0.4, y1: 0.3 })).toBe(800 + 0.2 * 1200);
  });

  it("maps a box to a rect", () => {
    expect(boxToRect(layout, 0, { x0: 0.25, y0: 0.5, x1: 0.75, y1: 0.75 })).toEqual({
      left: 150,
      top: 400,
      width: 300,
      height: 200,
    });
  });

  it("maps a region across pages", () => {
    const bounds = regionBounds(layout, {
      id: "r",
      start: { pageIndex: 0, y: 0.5 },
      end: { pageIndex: 1, y: 0.5 },
      mood: "calm",
      intensity: 1,
    });
    expect(bounds).toEqual({ startY: 400, endY: 1400 });
  });
});

describe("page units (saved scroll position)", () => {
  it("round-trips", () => {
    for (const y of [0, 100, 799, 800, 1500, 2000]) {
      expect(pageUnitsToStripY(layout, stripYToPageUnits(layout, y))).toBeCloseTo(y);
    }
  });

  it("is independent of the strip width", () => {
    const other = computeLayout(
      [
        { width: 1200, height: 1600 },
        { width: 1200, height: 2400 },
      ],
      390,
    );
    const units = stripYToPageUnits(layout, 1100);
    expect(units).toBeCloseTo(1.25);
    expect(pageUnitsToStripY(other, units)).toBeCloseTo(390 * (1.333333333 + 0.25 * 2), 2);
  });

  it("clamps outside the strip", () => {
    expect(stripYToPageUnits(layout, -50)).toBe(0);
    expect(stripYToPageUnits(layout, 5000)).toBeCloseTo(2);
  });
});
