// Downscale pages before upload (SPEC F2): ≤ 800 px wide, JPEG q≈0.85. Only the upload copy is shrunk;
// the stored page blobs stay at full size, and comic pages are never pixelated.

export const MAX_UPLOAD_WIDTH = 800;
export const UPLOAD_JPEG_QUALITY = 0.85;

/** Target size keeping the aspect ratio; never upscales. Pure, unit-tested. */
export function targetSize(width: number, height: number, maxWidth = MAX_UPLOAD_WIDTH): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) throw new Error(`Invalid page size ${width}×${height}.`);
  if (width <= maxWidth) return { width, height };
  return { width: maxWidth, height: Math.max(1, Math.round((height * maxWidth) / width)) };
}

/** Re-encode a page for upload. A JPEG that is already small enough is sent untouched. */
export async function downscalePage(blob: Blob, width: number, height: number): Promise<Blob> {
  const target = targetSize(width, height);
  if (target.width === width && blob.type === "image/jpeg") return blob;

  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get a 2D canvas to shrink the page.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (out) => (out ? resolve(out) : reject(new Error("The browser could not encode a page as JPEG."))),
        "image/jpeg",
        UPLOAD_JPEG_QUALITY,
      );
    });
  } finally {
    bitmap.close();
  }
}
