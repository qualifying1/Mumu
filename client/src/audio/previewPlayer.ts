// One-clip player for the Voices tab previews. Part of the audio layer: components never create Howl instances.
// Only one preview plays at a time; starting another stops the first. Errors reject, so the UI can show them.
import { Howl } from "howler";

let current: { howl: Howl; url: string; settle: (err?: Error) => void } | null = null;

/** Stop whatever preview is playing (its promise resolves). */
export function stopPreview(): void {
  current?.settle();
}

/** Play an mp3 blob and resolve when it ends. Call from a click handler so the browser allows audio. */
export function playPreview(blob: Blob): Promise<void> {
  stopPreview();
  return new Promise<void>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    let settled = false;
    const settle = (err?: Error): void => {
      if (settled) return;
      settled = true;
      if (current?.howl === howl) current = null;
      howl.unload();
      URL.revokeObjectURL(url);
      if (err) reject(err);
      else resolve();
    };
    const howl: Howl = new Howl({
      src: [url],
      format: ["mp3"], // blob URLs carry no extension, so Howler can't infer the format
      onend: () => settle(),
      onloaderror: (_id, err) => settle(new Error(`Could not load the preview clip: ${String(err)}`)),
      onplayerror: (_id, err) => settle(new Error(`Could not play the preview clip: ${String(err)}`)),
    });
    current = { howl, url, settle };
    howl.play();
  });
}
