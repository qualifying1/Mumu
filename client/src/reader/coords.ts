// The ONLY place page fractions (CONTRACT §1) are converted to pixels. Pure: no DOM, unit-tested in coords.test.ts.
import type { Box, Region } from "@mumu/shared";

export interface PageDims {
  width: number;
  height: number;
}

/** Pages stacked in one column. Heights come from aspect ratios, so layout never waits for images to load. */
export interface StripLayout {
  /** Rendered width of every page, in px. */
  width: number;
  /** Top of each page in strip px (the first page starts at 0). */
  offsets: number[];
  heights: number[];
  total: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function computeLayout(pages: readonly PageDims[], stripWidth: number): StripLayout {
  if (!(stripWidth > 0)) throw new Error(`Strip width must be positive (got ${stripWidth}).`);
  const offsets: number[] = [];
  const heights: number[] = [];
  let y = 0;
  for (const [i, p] of pages.entries()) {
    if (!(p.width > 0 && p.height > 0)) throw new Error(`Page ${i} has invalid dimensions ${p.width}×${p.height}.`);
    const h = (stripWidth * p.height) / p.width;
    offsets.push(y);
    heights.push(h);
    y += h;
  }
  return { width: stripWidth, offsets, heights, total: y };
}

function pageOffset(layout: StripLayout, pageIndex: number): number {
  const offset = layout.offsets[pageIndex];
  if (offset === undefined) {
    throw new Error(`pageIndex ${pageIndex} is outside the chapter (${layout.offsets.length} pages).`);
  }
  return offset;
}

/** A vertical position on a page (fraction 0–1 of its height) → strip px. */
export function pageYToStrip(layout: StripLayout, pageIndex: number, fractionY: number): number {
  return pageOffset(layout, pageIndex) + fractionY * layout.heights[pageIndex]!;
}

/** The cue anchor: the vertical centre of its box, in strip px. */
export function anchorY(layout: StripLayout, pageIndex: number, box: Box): number {
  return pageYToStrip(layout, pageIndex, (box.y0 + box.y1) / 2);
}

export function boxToRect(layout: StripLayout, pageIndex: number, box: Box): Rect {
  const top = pageYToStrip(layout, pageIndex, box.y0);
  return {
    left: box.x0 * layout.width,
    top,
    width: (box.x1 - box.x0) * layout.width,
    height: pageYToStrip(layout, pageIndex, box.y1) - top,
  };
}

export function regionBounds(layout: StripLayout, region: Region): { startY: number; endY: number } {
  return {
    startY: pageYToStrip(layout, region.start.pageIndex, region.start.y),
    endY: pageYToStrip(layout, region.end.pageIndex, region.end.y),
  };
}

/**
 * Resolution-independent scroll position: `pageIndex + fraction` (e.g. 2.37 = 37% down page 2).
 * This is what `chapters.lastReadY` stores, so a saved position survives a different viewport width.
 */
export function stripYToPageUnits(layout: StripLayout, y: number): number {
  if (layout.offsets.length === 0) return 0;
  const clamped = Math.min(Math.max(y, 0), layout.total);
  let index = layout.offsets.length - 1;
  while (index > 0 && layout.offsets[index]! > clamped) index--;
  const fraction = (clamped - layout.offsets[index]!) / layout.heights[index]!;
  return index + Math.min(fraction, 1);
}

export function pageUnitsToStripY(layout: StripLayout, units: number): number {
  if (layout.offsets.length === 0) return 0;
  const index = Math.min(Math.max(Math.floor(units), 0), layout.offsets.length - 1);
  const fraction = units - index;
  return layout.offsets[index]! + fraction * layout.heights[index]!;
}
