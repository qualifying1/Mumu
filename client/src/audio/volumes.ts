// Pure volume maths for the reader's audio (SPEC F4 toggles). Unit-tested in volumes.test.ts.
import type { SettingsMap } from "../db/db.ts";

export type AudioSettings = SettingsMap["audio"];

export interface ChannelVolumes {
  voices: number;
  music: number;
  sfx: number;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Master × channel volume; 0 when the master or the channel is off. */
export function effectiveVolumes(audio: AudioSettings): ChannelVolumes {
  const channel = (c: AudioSettings["voices"]): number => (audio.master.on && c.on ? clamp01(audio.master.volume) * clamp01(c.volume) : 0);
  return { voices: channel(audio.voices), music: channel(audio.music), sfx: channel(audio.sfx) };
}

/** Music sits at this fraction of its volume while a voice plays (SPEC F4). */
export const DUCK_LEVEL = 0.35;

export function musicTarget(volumes: ChannelVolumes, ducked: boolean): number {
  return volumes.music * (ducked ? DUCK_LEVEL : 1);
}
