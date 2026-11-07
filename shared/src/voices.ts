// Default voice roster (docs/DECISIONS.md) → the 30 premade VoiceProfiles (CONTRACT §3).
// Voice names are provider (Gemini TTS) prebuilt voices. Both lists live here, in shared
// config, so no lane hardcodes a voice name.
import type { VoiceSlot } from "./enums.js";
import { VOICE_SLOTS } from "./enums.js";
import type { CharacterVoice, VoiceProfile } from "./schemas.js";

/** Gemini TTS prebuilt voices. Feeds the Voices-tab dropdown. */
export const AVAILABLE_VOICES = [
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe",
  "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
  "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
] as const;

interface RosterVariant {
  label: string;
  voice: (typeof AVAILABLE_VOICES)[number];
  pitch: number;
}

interface RosterSlot {
  style: string;
  speed: number;
  variants: readonly [RosterVariant, RosterVariant, RosterVariant];
}

export const VOICE_ROSTER: Record<VoiceSlot, RosterSlot> = {
  narrator: {
    style: "calm, cinematic",
    speed: 1.0,
    variants: [
      { label: "Narrator", voice: "Achird", pitch: 0 },
      { label: "Storyteller", voice: "Sulafat", pitch: 0 },
      { label: "Chronicler", voice: "Sadaltager", pitch: 0 },
    ],
  },
  male_young: {
    style: "energetic, confident",
    speed: 1.05,
    variants: [
      { label: "Young Hero A", voice: "Puck", pitch: 0 },
      { label: "Young Hero B", voice: "Fenrir", pitch: 0 },
      { label: "Young Hero C", voice: "Sadachbia", pitch: 0 },
    ],
  },
  male_adult: {
    style: "steady, warm",
    speed: 1.0,
    variants: [
      { label: "Steady Man A", voice: "Orus", pitch: 0 },
      { label: "Steady Man B", voice: "Charon", pitch: 0 },
      { label: "Steady Man C", voice: "Iapetus", pitch: 0 },
    ],
  },
  male_deep: {
    style: "low, menacing",
    speed: 0.95,
    variants: [
      { label: "Deep Voice A", voice: "Algenib", pitch: 0 },
      { label: "Deep Voice B", voice: "Alnilam", pitch: -2 },
      { label: "Deep Voice C", voice: "Rasalgethi", pitch: -3 },
    ],
  },
  male_elder: {
    style: "wise, slow",
    speed: 0.9,
    variants: [
      { label: "Old Sage A", voice: "Gacrux", pitch: -1 },
      { label: "Old Sage B", voice: "Umbriel", pitch: -2 },
      { label: "Old Sage C", voice: "Zubenelgenubi", pitch: -3 },
    ],
  },
  female_young: {
    style: "bright, lively",
    speed: 1.05,
    variants: [
      { label: "Bright Girl A", voice: "Leda", pitch: 0 },
      { label: "Bright Girl B", voice: "Laomedeia", pitch: 0 },
      { label: "Bright Girl C", voice: "Zephyr", pitch: 0 },
    ],
  },
  female_adult: {
    style: "composed, warm",
    speed: 1.0,
    variants: [
      { label: "Calm Woman A", voice: "Kore", pitch: 0 },
      { label: "Calm Woman B", voice: "Aoede", pitch: 0 },
      { label: "Calm Woman C", voice: "Callirrhoe", pitch: 0 },
    ],
  },
  female_cold: {
    style: "cool, detached",
    speed: 0.95,
    variants: [
      { label: "Cold Beauty A", voice: "Erinome", pitch: 0 },
      { label: "Cold Beauty B", voice: "Schedar", pitch: 0 },
      { label: "Cold Beauty C", voice: "Despina", pitch: -1 },
    ],
  },
  female_elder: {
    style: "gentle, aged",
    speed: 0.9,
    variants: [
      { label: "Old Lady A", voice: "Vindemiatrix", pitch: -1 },
      { label: "Old Lady B", voice: "Achernar", pitch: -2 },
      { label: "Old Lady C", voice: "Pulcherrima", pitch: -3 },
    ],
  },
  child: {
    style: "playful, high",
    speed: 1.1,
    variants: [
      { label: "Kid A", voice: "Autonoe", pitch: 3 },
      { label: "Kid B", voice: "Zephyr", pitch: 4 },
      { label: "Kid C", voice: "Puck", pitch: 5 },
    ],
  },
};

/** The 30 premade profiles, ids `<slot>_1..3`. `narrator_1` is the narrator voice (not Mumu's). */
export const DEFAULT_PROFILES: readonly VoiceProfile[] = VOICE_SLOTS.flatMap((slot) =>
  VOICE_ROSTER[slot].variants.map((v, i) => ({
    id: `${slot}_${i + 1}`,
    slot,
    label: v.label,
    voice: v.voice,
    style: VOICE_ROSTER[slot].style,
    speed: VOICE_ROSTER[slot].speed,
    pitch: v.pitch,
  })),
);

/** Profile used for narration captions and unknown speakers (the narrator voice). */
export const NARRATOR_PROFILE_ID = "narrator_1";

/** The one way to snapshot a profile into a character's voice (CONTRACT §3). Casting and the Voices tab both use it. */
export function snapshotVoice(profile: Pick<VoiceProfile, "voice" | "style" | "speed" | "pitch">): CharacterVoice {
  return { voice: profile.voice, style: profile.style, speed: profile.speed, pitch: profile.pitch };
}
