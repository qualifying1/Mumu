import { NARRATOR_PROFILE_ID, type Character, type CharacterVoice, type Cue, type Delivery, type Emotion, type VoiceProfile } from "@mumu/shared";

/** docs/PROMPTS.md §3 phrase tables. Bump TTS_STYLE_VERSION if a phrase changes (the style string is part of the cache key anyway). */
export const EMOTION_PHRASE: Record<Emotion, string> = {
  neutral: "natural",
  happy: "cheerful",
  angry: "angry, intense",
  sad: "sad, subdued",
  scared: "frightened, shaky",
  surprised: "surprised",
  determined: "determined, resolute",
  tender: "soft, tender",
  smug: "smug, teasing",
};

export const DELIVERY_PHRASE: Record<Delivery, string> = {
  normal: "",
  shout: "shouting loudly",
  whisper: "whispering quietly",
};

const THOUGHT_PHRASE = "inner monologue, intimate";
const RECAP_STYLE = "playful, warm storyteller";

const join = (parts: readonly string[]) => parts.map((p) => p.trim()).filter(Boolean).join(", ");

/** `<character.style>, <emotion>, <delivery>`; thoughts add the inner-monologue phrase after the style. */
export function characterStyle(voice: Pick<CharacterVoice, "style">, cue: Pick<Cue, "kind" | "emotion" | "delivery">): string {
  return join([voice.style, cue.kind === "thought" ? THOUGHT_PHRASE : "", EMOTION_PHRASE[cue.emotion], DELIVERY_PHRASE[cue.delivery]]);
}

/** Narration and unknown speakers: the narrator profile's style as narration, plus a shout/whisper if the lettering asks for one. */
export function narrationStyle(narrator: Pick<CharacterVoice, "style">, cue: Pick<Cue, "delivery">): string {
  return join([`${narrator.style.trim()} narration`, DELIVERY_PHRASE[cue.delivery]]);
}

/** The recap is always told in the narrator voice with this style (PROMPTS §3). */
export function recapStyle(): string {
  return RECAP_STYLE;
}

/** Text a TTS model can say: at least one letter or digit (CONTRACT §5: otherwise `audioId` is null). */
export function hasSpeakableText(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

/** Everything a TTS call and the encode step need for one clip. */
export interface VoiceSpec {
  voice: string;
  style: string;
  speed: number;
  pitch: number;
}

export function narratorVoice(profiles: readonly VoiceProfile[]): VoiceProfile {
  const narrator = profiles.find((p) => p.id === NARRATOR_PROFILE_ID);
  if (!narrator) throw new Error(`voicing: the profiles sent with the job have no ${NARRATOR_PROFILE_ID}`);
  return narrator;
}

/**
 * CONTRACT §3 voice resolution. A speech/thought line with a character uses that character's
 * `voice` snapshot (never the live profile table); narration, unknown speakers and the recap use
 * the narrator profile. A characterId that is in neither list is a bug upstream: fail loudly.
 */
export function resolveCueVoice(cue: Pick<Cue, "id" | "kind" | "characterId" | "emotion" | "delivery">, characters: readonly Character[], profiles: readonly VoiceProfile[]): VoiceSpec {
  if (cue.kind === "sfx") throw new Error(`voicing: ${cue.id} is a sound effect and has no voice`);
  if ((cue.kind === "speech" || cue.kind === "thought") && cue.characterId !== null) {
    const character = characters.find((c) => c.id === cue.characterId);
    if (!character) throw new Error(`voicing: ${cue.id} names character ${cue.characterId}, who is neither in meta.cast nor newly created`);
    const { voice, speed, pitch } = character.voice;
    return { voice, speed, pitch, style: characterStyle(character.voice, cue) };
  }
  const n = narratorVoice(profiles);
  return { voice: n.voice, speed: n.speed, pitch: n.pitch, style: narrationStyle(n, cue) };
}

export function resolveRecapVoice(profiles: readonly VoiceProfile[]): VoiceSpec {
  const n = narratorVoice(profiles);
  return { voice: n.voice, speed: n.speed, pitch: n.pitch, style: recapStyle() };
}
