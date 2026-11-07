import sharp from "sharp";

/**
 * Target segment height as a multiple of page width (the allowed range is MIN..MAX), about 1×.
 * Dense pages (8-15 bubbles) lost text when a whole 1.4× page went to the model as one image,
 * so a page taller than MAX is cut into bands near 1× instead.
 */
export const SEGMENT_MIN_RATIO = 0.7;
export const SEGMENT_MAX_RATIO = 1.2;
/** Fraction of a segment's height shared with the next segment. */
export const SEGMENT_OVERLAP = 0.12;

/** A horizontal band of one page, in pixels of that page. */
export interface SegmentRect {
  /** Top edge (px, integer). */
  top: number;
  /** Height (px, integer). */
  height: number;
}

/**
 * Plan the bands for one page. A page no taller than SEGMENT_MAX_RATIO× its width is a single
 * segment. Taller pages get the fewest equal-height segments (each at most that tall) whose
 * overlaps cover the page exactly. The overlap is at least 12% of a segment; when the
 * equal-split height would fall under SEGMENT_MIN_RATIO× the width, segments are clamped to
 * that and the overlap grows instead, so every multi-segment band is 0.7–1.2× as tall as wide.
 */
export function planSegments(width: number, height: number): SegmentRect[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`planSegments needs positive integer dimensions, got ${width}x${height}`);
  }
  const maxHeight = Math.floor(width * SEGMENT_MAX_RATIO);
  if (height <= maxHeight) return [{ top: 0, height }];

  // n segments of height s overlapping by SEGMENT_OVERLAP*s cover n*s - (n-1)*overlap*s.
  const coverage = (n: number) => n - (n - 1) * SEGMENT_OVERLAP;
  let n = 2;
  while (height / coverage(n) > maxHeight) n++;

  const segHeight = Math.max(Math.ceil(height / coverage(n)), Math.ceil(width * SEGMENT_MIN_RATIO));
  // Evenly spaced tops, first at 0 and last flush with the page bottom. Since segHeight is
  // at least the 12%-overlap height, the overlap between neighbours is at least 12%.
  const step = (height - segHeight) / (n - 1);
  const out: SegmentRect[] = [];
  for (let i = 0; i < n; i++) {
    const top = i === n - 1 ? height - segHeight : Math.round(i * step);
    out.push({ top, height: segHeight });
  }
  return out;
}

/** A segment of the whole chapter, numbered in reading order. */
export interface Segment extends SegmentRect {
  /** 0-based position across the whole chapter. */
  index: number;
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  /** JPEG bytes of just this band. */
  image: Buffer;
}

export interface PageInput {
  /** Image bytes, any format sharp reads. */
  bytes: Buffer;
}

const JPEG_QUALITY = 85;

/** Cut every page into its bands, in reading order. */
export async function sliceChapter(pages: PageInput[]): Promise<Segment[]> {
  const segments: Segment[] = [];
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex]!;
    const meta = await sharp(page.bytes).metadata();
    if (!meta.width || !meta.height) throw new Error(`slice: page ${pageIndex} has no readable dimensions`);
    for (const rect of planSegments(meta.width, meta.height)) {
      const image = await sharp(page.bytes)
        .extract({ left: 0, top: rect.top, width: meta.width, height: rect.height })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer();
      segments.push({
        ...rect,
        index: segments.length,
        pageIndex,
        pageWidth: meta.width,
        pageHeight: meta.height,
        image,
      });
    }
  }
  return segments;
}

/** What the client does before upload: at most 800 px wide, JPEG q≈0.85 (CONTRACT §4). */
export async function normalizePage(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes).rotate().resize({ width: 800, withoutEnlargement: true }).jpeg({ quality: JPEG_QUALITY }).toBuffer();
}
