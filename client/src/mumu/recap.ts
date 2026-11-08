// Pure helpers for Mumu's "Previously…" recap bubble (SPEC F8). The narrator voice itself is played by useMumuRecap.
import { RECAP_CHARS_PER_S, RECAP_SILENT_MAX_S, RECAP_SILENT_MIN_S } from "./constants.ts";

export const RECAP_TITLE = "Previously…";

/** The audio volume 0..1 for the narrator recap: the master switch and the voices channel both have to be on. */
export function recapVolume(audio: { master: { on: boolean; volume: number }; voices: { on: boolean; volume: number } }): number {
  if (!audio.master.on || !audio.voices.on) return 0;
  const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
  return clamp01(audio.master.volume) * clamp01(audio.voices.volume);
}

/** How long the bubble stays when there is no audio to wait for: enough time to read the text. */
export function silentRecapSeconds(text: string): number {
  return Math.min(Math.max(text.length / RECAP_CHARS_PER_S, RECAP_SILENT_MIN_S), RECAP_SILENT_MAX_S);
}
