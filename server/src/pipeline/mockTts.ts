import { TTS_SAMPLE_RATE, pcmToWav } from "./audio.js";
import type { TtsGenerate } from "./gemini.js";

/** Model name reported (and used in cache keys) when TTS is mocked, so mock clips never mix with real ones. */
export const MOCK_TTS_MODEL = "mock-tts";

const MS_PER_CHAR = 60;
const MIN_MS = 400;
const MAX_MS = 6000;

/** A stable pitch (220-660 Hz) per voice name, so different voices are audibly different. */
export function voiceFrequency(voice: string): number {
  let h = 0;
  for (const ch of voice) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 220 + (h % 441);
}

/** Length of the fake clip: grows with the text so progress and durations look realistic. */
export function mockDurationMs(text: string): number {
  return Math.min(MAX_MS, Math.max(MIN_MS, text.length * MS_PER_CHAR));
}

/**
 * Stand-in for Gemini TTS while the quota is unavailable (`MOCK_TTS=1`): a quiet sine beep as a valid
 * 24 kHz mono WAV, so the encode step, package and client playback are exercised for real.
 */
export function createMockTtsGenerate(): TtsGenerate {
  return async ({ voice, text }) => {
    const samples = Math.round((mockDurationMs(text) / 1000) * TTS_SAMPLE_RATE);
    const freq = voiceFrequency(voice);
    const fade = Math.round(TTS_SAMPLE_RATE * 0.02);
    const pcm = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++) {
      const envelope = Math.min(1, i / fade, (samples - 1 - i) / fade);
      pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / TTS_SAMPLE_RATE) * 0.25 * 32767 * envelope), i * 2);
    }
    return pcmToWav(pcm);
  };
}
