// CONTRACT §2. The prompts must use exactly these values.
import { z } from "zod";

export const CONTRACT_VERSION = 1 as const;

export const CUE_KINDS = ["speech", "thought", "narration", "sfx"] as const;
export const EMOTIONS = [
  "neutral",
  "happy",
  "angry",
  "sad",
  "scared",
  "surprised",
  "determined",
  "tender",
  "smug",
] as const;
export const DELIVERIES = ["normal", "shout", "whisper"] as const;
export const MOODS = ["calm", "tense", "battle", "climax", "romance", "sad", "comedic", "mystery"] as const;
export const INTENSITIES = [1, 2, 3] as const;
export const SFX_TAGS = [
  "punch",
  "sword_clash",
  "explosion",
  "whoosh",
  "footsteps",
  "door",
  "heartbeat",
  "gasp",
  "crowd",
  "magic",
] as const;
export const VOICE_SLOTS = [
  "narrator",
  "male_young",
  "male_adult",
  "male_deep",
  "male_elder",
  "female_young",
  "female_adult",
  "female_cold",
  "female_elder",
  "child",
] as const;
export const JOB_STATES = [
  "queued",
  "slicing",
  "analyzing",
  "reasoning",
  "casting",
  "voicing",
  "packaging",
  "done",
  "failed",
] as const;

export const CueKindSchema = z.enum(CUE_KINDS);
export const EmotionSchema = z.enum(EMOTIONS);
export const DeliverySchema = z.enum(DELIVERIES);
export const MoodSchema = z.enum(MOODS);
export const IntensitySchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export const SfxTagSchema = z.enum(SFX_TAGS);
export const VoiceSlotSchema = z.enum(VOICE_SLOTS);
export const JobStateSchema = z.enum(JOB_STATES);

export type CueKind = z.infer<typeof CueKindSchema>;
export type Emotion = z.infer<typeof EmotionSchema>;
export type Delivery = z.infer<typeof DeliverySchema>;
export type Mood = z.infer<typeof MoodSchema>;
export type Intensity = z.infer<typeof IntensitySchema>;
export type SfxTag = z.infer<typeof SfxTagSchema>;
export type VoiceSlot = z.infer<typeof VoiceSlotSchema>;
export type JobState = z.infer<typeof JobStateSchema>;
