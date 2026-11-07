import { useEffect, useRef } from "react";

/** Cover art is drawn at 64 px wide, then scaled by a whole number (docs/DESIGN.md). */
export const COVER_W = 64;
export const COVER_H = 88;

interface Props {
  /** The cover page image (first page of the chapter), or null to draw a plain placeholder. */
  blob: Blob | null;
  /** Whole-number display scale; 2 → 128×176 px. */
  scale: number;
  className?: string;
  label: string;
}

/** Crop rectangle in source pixels so a page fills the 64×88 cover (centre-cropped, anchored to the top). */
export function coverCrop(srcW: number, srcH: number): { sx: number; sy: number; sw: number; sh: number } {
  const target = COVER_W / COVER_H;
  if (srcW / srcH > target) {
    const sw = srcH * target;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH };
  }
  return { sx: 0, sy: 0, sw: srcW, sh: srcW / target };
}

export default function PixelCover({ blob, scale, className = "", label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) throw new Error("PixelCover needs a 2d canvas.");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, COVER_W, COVER_H);
    if (!blob) return;
    let cancelled = false;
    createImageBitmap(blob)
      .then((bmp) => {
        if (cancelled) {
          bmp.close();
          return;
        }
        const { sx, sy, sw, sh } = coverCrop(bmp.width, bmp.height);
        // Drawing a big page into a tiny canvas is what makes the cover pixel art; smoothing off keeps it blocky.
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "medium";
        ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, COVER_W, COVER_H);
        bmp.close();
      })
      .catch((e: unknown) => {
        console.error("Cover decode failed", e);
      });
    return () => {
      cancelled = true;
    };
  }, [blob]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      width={COVER_W}
      height={COVER_H}
      className={`pixelated bg-wood-dark ${className}`}
      style={{ width: COVER_W * scale, height: COVER_H * scale }}
    />
  );
}
