import { BoxSchema } from "@mumu/shared";
import { describe, expect, it } from "vitest";
import { mapBox, mergeSegments, normalizeText, overlapOfSmaller, readingOrder } from "./merge.js";
import type { VisionItem } from "./visionSchema.js";
import type { RawSegmentResult } from "./vision.js";

const item = (over: Partial<VisionItem> & Pick<VisionItem, "text" | "box">): VisionItem => ({
  kind: "speech",
  emotion: "neutral",
  delivery: "normal",
  speakerHint: null,
  speakerCastId: null,
  sfxTag: null,
  ...over,
});

const seg = (
  index: number,
  pageIndex: number,
  top: number,
  height: number,
  pageHeight: number,
  items: VisionItem[],
): RawSegmentResult => ({
  segment: { index, pageIndex, top, height, pageWidth: 800, pageHeight },
  result: { items, mood: "calm", intensity: 1 },
});

describe("mapBox", () => {
  it("maps [ymin,xmin,ymax,xmax] 0-1000 of the segment to page fractions", () => {
    // Segment covers rows 500..1500 of a 2000 px page.
    const box = mapBox({ top: 500, height: 1000, pageHeight: 2000 }, [100, 200, 300, 600]);
    expect(box.x0).toBeCloseTo(0.2);
    expect(box.x1).toBeCloseTo(0.6);
    expect(box.y0).toBeCloseTo((500 + 100) / 2000);
    expect(box.y1).toBeCloseTo((500 + 300) / 2000);
  });

  it("is the identity in y for a whole-page segment", () => {
    const box = mapBox({ top: 0, height: 1107, pageHeight: 1107 }, [419, 114, 497, 205]);
    expect(box).toEqual({ x0: 0.114, y0: 0.419, x1: 0.205, y1: 0.497 });
  });

  it("always yields a box BoxSchema accepts", () => {
    const edge = mapBox({ top: 0, height: 100, pageHeight: 100 }, [1000, 1000, 1000, 1000].map((v, i) => (i < 2 ? v - 0 : v)) as never);
    expect(BoxSchema.safeParse(edge).success).toBe(true);
    const flat = mapBox({ top: 0, height: 100, pageHeight: 100 }, [500, 500, 500.0001, 500.0001]);
    expect(BoxSchema.safeParse(flat).success).toBe(true);
  });
});

describe("text and overlap helpers", () => {
  it("normalizes punctuation and case away", () => {
    expect(normalizeText("Not so fast!")).toBe("notsofast");
    expect(normalizeText("...?!")).toBe("");
  });
  it("overlapOfSmaller is 1 when one box is inside the other and 0 when apart", () => {
    const big = { x0: 0, y0: 0, x1: 1, y1: 1 };
    expect(overlapOfSmaller(big, { x0: 0.2, y0: 0.2, x1: 0.4, y1: 0.4 })).toBeCloseTo(1);
    expect(overlapOfSmaller({ x0: 0, y0: 0, x1: 0.1, y1: 0.1 }, { x0: 0.5, y0: 0.5, x1: 0.6, y1: 0.6 })).toBe(0);
  });
});

describe("dedupe across overlapping segments", () => {
  // A 3000 px page cut into two 1800 px bands overlapping on 600..1800... use simple geometry:
  // band A = rows 0..1800, band B = rows 1200..3000. A bubble at page rows 1400..1500 is in both.
  const pageHeight = 3000;
  const inA = item({ text: "Hello there!", box: [778, 100, 833, 400] }); // (1400..1500)/1800*1000
  const inB = item({ text: "Hello there!", box: [111, 100, 167, 400] }); // (1400..1500 - 1200)/1800*1000

  it("keeps a bubble seen in two segments once", () => {
    const lines = mergeSegments([seg(0, 0, 0, 1800, pageHeight, [inA]), seg(1, 0, 1200, 1800, pageHeight, [inB])]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toBe("Hello there!");
    expect(lines[0]!.box.y0).toBeCloseTo(1400 / pageHeight, 2);
  });

  it("keeps the fuller text when one copy was cut off at a slice edge", () => {
    const cut = item({ text: "Not so", box: [950, 100, 1000, 400] });
    const full = item({ text: "Not so fast!", box: [40, 100, 160, 400] });
    // cut: page rows 1710..1800 in band A; full: rows 1272..1488 in band B -> make them coincide on the page
    const cutAtEdge = { ...cut, box: [944, 100, 1000, 400] }; // rows 1700..1800
    const fullInB = { ...full, box: [278, 100, 389, 400] }; // rows 1700..1900
    const lines = mergeSegments([seg(0, 0, 0, 1800, pageHeight, [cutAtEdge]), seg(1, 0, 1200, 1800, pageHeight, [fullInB])]);
    expect(lines.map((l) => l.text)).toEqual(["Not so fast!"]);
  });

  it("does not merge identical text at different positions on the page", () => {
    // Real case from ch1: "Tchkshkk!!" appears twice, side by side, in one segment.
    const a = item({ kind: "sfx", text: "Tchkshkk!!", box: [706, 253, 726, 396] });
    const b = item({ kind: "sfx", text: "Tchkshkk!!", box: [705, 622, 727, 757] });
    expect(mergeSegments([seg(0, 0, 0, 1107, 1107, [a, b])])).toHaveLength(2);
  });

  it("does not merge repeats from different segments when the boxes are apart", () => {
    const a = item({ text: "Why?", box: [100, 100, 150, 300] });
    const b = item({ text: "Why?", box: [800, 100, 850, 300] });
    expect(mergeSegments([seg(0, 0, 0, 1107, 4000, [a]), seg(1, 0, 1000, 1107, 4000, [b])])).toHaveLength(2);
  });

  it("does not merge across pages", () => {
    const a = item({ text: "Ok.", box: [100, 100, 200, 300] });
    expect(mergeSegments([seg(0, 0, 0, 1000, 1000, [a]), seg(1, 1, 0, 1000, 1000, [a])])).toHaveLength(2);
  });
});

describe("reading order", () => {
  const b = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 });

  it("reads rows top to bottom and left to right within a row", () => {
    const items = [
      { id: "right", box: b(0.6, 0.1, 0.9, 0.15) },
      { id: "below", box: b(0.1, 0.4, 0.4, 0.45) },
      { id: "left", box: b(0.1, 0.11, 0.4, 0.16) },
    ];
    expect(readingOrder(items).map((i) => i.id)).toEqual(["left", "right", "below"]);
  });

  it("puts side-by-side bubbles in the same row even when one is a bit lower", () => {
    const items = [
      { id: "R", box: b(0.6, 0.1, 0.9, 0.2) },
      { id: "L", box: b(0.1, 0.13, 0.4, 0.23) },
    ];
    expect(readingOrder(items).map((i) => i.id)).toEqual(["L", "R"]);
  });

  it("keeps stacked bubbles in separate rows", () => {
    const items = [
      { id: "low", box: b(0.1, 0.5, 0.4, 0.55) },
      { id: "high", box: b(0.6, 0.1, 0.9, 0.15) },
    ];
    expect(readingOrder(items).map((i) => i.id)).toEqual(["high", "low"]);
  });

  it("is independent of the input order", () => {
    const items = [
      { id: "a", box: b(0.1, 0.1, 0.3, 0.15) },
      { id: "b", box: b(0.5, 0.1, 0.7, 0.15) },
      { id: "c", box: b(0.1, 0.3, 0.3, 0.35) },
      { id: "d", box: b(0.5, 0.31, 0.7, 0.36) },
    ];
    const want = ["a", "b", "c", "d"];
    expect(readingOrder(items).map((i) => i.id)).toEqual(want);
    expect(readingOrder([...items].reverse()).map((i) => i.id)).toEqual(want);
  });
});

describe("mergeSegments order", () => {
  it("assigns unique, increasing, 1-based orders: pages first, then reading order", () => {
    const p0 = seg(0, 0, 0, 1000, 1000, [
      item({ text: "second row", box: [600, 100, 650, 400] }),
      item({ text: "first row right", box: [100, 600, 150, 900] }),
      item({ text: "first row left", box: [100, 100, 150, 400] }),
    ]);
    const p1 = seg(1, 1, 0, 1000, 1000, [item({ text: "next page", box: [100, 100, 150, 400] })]);
    const lines = mergeSegments([p1, p0]); // input order must not matter
    expect(lines.map((l) => l.text)).toEqual(["first row left", "first row right", "second row", "next page"]);
    expect(lines.map((l) => l.order)).toEqual([1, 2, 3, 4]);
  });

  it("carries the segment mood/intensity and nulls sfxTag on non-sfx lines", () => {
    const lines = mergeSegments([seg(0, 0, 0, 1000, 1000, [item({ text: "Hi", box: [10, 10, 20, 20], sfxTag: "punch" })])]);
    expect(lines[0]).toMatchObject({ mood: "calm", intensity: 1, sfxTag: null });
  });

  it("returns an empty transcript for slices with no text", () => {
    expect(mergeSegments([seg(0, 0, 0, 1000, 1000, [])])).toEqual([]);
  });
});
