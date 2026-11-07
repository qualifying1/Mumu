import type { VoiceProfile } from "@mumu/shared";
import { encodeMp3 } from "./pipeline/audio.js";
import { ttsWav, type TtsContext } from "./pipeline/voicing.js";

/**
 * `POST /preview`: one clip of `text` in the profile's voice and style. The raw WAV goes through the
 * same TTS cache as chapters (key: model + voice + style + text), and the profile's speed and pitch
 * are applied at the encode step only, so retuning them never costs a TTS call (CONTRACT §9).
 */
export async function previewClip(profile: Pick<VoiceProfile, "voice" | "style" | "speed" | "pitch">, text: string, ctx: TtsContext): Promise<Buffer> {
  const wav = await ttsWav({ voice: profile.voice, style: profile.style }, text, ctx);
  const { mp3 } = await encodeMp3(wav, { speed: profile.speed, pitch: profile.pitch });
  return mp3;
}
