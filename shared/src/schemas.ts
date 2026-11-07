// CONTRACT §3–5: voice profiles, characters, the HTTP API and the ChapterPackage.
import { z } from "zod";
import {
  CONTRACT_VERSION,
  CueKindSchema,
  DeliverySchema,
  EmotionSchema,
  IntensitySchema,
  JobStateSchema,
  MoodSchema,
  SfxTagSchema,
  VoiceSlotSchema,
} from "./enums.js";

/** Page-fraction coordinates (0–1 of that page's width/height). CONTRACT §1. */
export const BoxSchema = z
  .object({
    x0: z.number().min(0).max(1),
    y0: z.number().min(0).max(1),
    x1: z.number().min(0).max(1),
    y1: z.number().min(0).max(1),
  })
  .refine((b) => b.x0 < b.x1 && b.y0 < b.y1, { message: "box needs x0 < x1 and y0 < y1" });
export type Box = z.infer<typeof BoxSchema>;

// ---- §3 Voice profiles and characters ----

export const VoiceProfileSchema = z.object({
  id: z.string().regex(/^[a-z_]+_[123]$/, "profile id must be <slot>_<1|2|3>"),
  slot: VoiceSlotSchema,
  label: z.string().min(1),
  voice: z.string().min(1),
  style: z.string(),
  speed: z.number().min(0.8).max(1.2),
  pitch: z.number().int().min(-6).max(6),
});
export type VoiceProfile = z.infer<typeof VoiceProfileSchema>;

export const CharacterSchema = z.object({
  id: z.string().min(1),
  seriesId: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  voiceSlot: VoiceSlotSchema,
  profileId: z.string().min(1),
  firstSeenChapterId: z.string().min(1),
});
export type Character = z.infer<typeof CharacterSchema>;

// ---- §5 ChapterPackage ----

export const CueSchema = z.object({
  id: z.string().min(1),
  order: z.number().int(),
  kind: CueKindSchema,
  pageIndex: z.number().int().min(0),
  box: BoxSchema,
  text: z.string(),
  characterId: z.string().min(1).nullable(),
  emotion: EmotionSchema,
  delivery: DeliverySchema,
  /** null for sfx and for text with no letters or digits */
  audioId: z.string().min(1).nullable(),
  /** sfx only; null means no matching sound */
  sfxTag: SfxTagSchema.nullable(),
});
export type Cue = z.infer<typeof CueSchema>;

const RegionPointSchema = z.object({
  pageIndex: z.number().int().min(0),
  y: z.number().min(0).max(1),
});

export const RegionSchema = z.object({
  id: z.string().min(1),
  start: RegionPointSchema,
  end: RegionPointSchema,
  mood: MoodSchema,
  intensity: IntensitySchema,
});
export type Region = z.infer<typeof RegionSchema>;

export const AudioClipSchema = z.object({
  id: z.string().min(1),
  mime: z.literal("audio/mpeg"),
  durationMs: z.number().int().positive(),
  dataBase64: z.string().min(1),
});
export type AudioClip = z.infer<typeof AudioClipSchema>;

export const ModelsSchema = z.object({
  vision: z.string().min(1),
  reasoning: z.string().min(1),
  tts: z.string().min(1),
});
export type Models = z.infer<typeof ModelsSchema>;

export const RecapSchema = z.object({
  text: z.string().min(1),
  audioId: z.string().min(1),
});
export type Recap = z.infer<typeof RecapSchema>;

export const ChapterPackageSchema = z
  .object({
    contractVersion: z.literal(CONTRACT_VERSION),
    seriesId: z.string().min(1),
    chapterId: z.string().min(1),
    models: ModelsSchema,
    newCharacters: z.array(CharacterSchema),
    cues: z.array(CueSchema),
    regions: z.array(RegionSchema),
    recap: RecapSchema,
    audio: z.array(AudioClipSchema),
  })
  .superRefine((pkg, ctx) => {
    const audioIds = new Set(pkg.audio.map((a) => a.id));
    if (audioIds.size !== pkg.audio.length) {
      ctx.addIssue({ code: "custom", path: ["audio"], message: "duplicate audio ids" });
    }
    pkg.cues.forEach((cue, i) => {
      if (cue.audioId !== null && !audioIds.has(cue.audioId)) {
        ctx.addIssue({ code: "custom", path: ["cues", i, "audioId"], message: `no audio clip ${cue.audioId}` });
      }
      if (i > 0 && cue.order <= pkg.cues[i - 1]!.order) {
        ctx.addIssue({ code: "custom", path: ["cues", i, "order"], message: "cues must be sorted by increasing order" });
      }
    });
    if (!audioIds.has(pkg.recap.audioId)) {
      ctx.addIssue({ code: "custom", path: ["recap", "audioId"], message: `no audio clip ${pkg.recap.audioId}` });
    }
  });
export type ChapterPackage = z.infer<typeof ChapterPackageSchema>;

// ---- §4 HTTP API ----

export const ErrorBodySchema = z.object({ error: z.string(), detail: z.string().optional() });
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

export const HealthSchema = z.object({
  ok: z.boolean(),
  contractVersion: z.literal(CONTRACT_VERSION),
  models: ModelsSchema,
});
export type Health = z.infer<typeof HealthSchema>;

/** `meta` field of `POST /jobs` (multipart). */
export const JobMetaSchema = z.object({
  seriesId: z.string().min(1),
  chapterId: z.string().min(1),
  cast: z.array(CharacterSchema),
  profiles: z.array(VoiceProfileSchema),
});
export type JobMeta = z.infer<typeof JobMetaSchema>;

export const CreateJobResponseSchema = z.object({ jobId: z.string().min(1) });
export type CreateJobResponse = z.infer<typeof CreateJobResponseSchema>;

export const JobStatusSchema = z.object({
  state: JobStateSchema,
  progress: z.number().min(0).max(1),
  message: z.string(),
  error: z.string().optional(),
});
export type JobStatus = z.infer<typeof JobStatusSchema>;

/** Body of `POST /preview`. */
export const PreviewRequestSchema = z.object({
  profile: VoiceProfileSchema,
  text: z.string().min(1).max(200),
});
export type PreviewRequest = z.infer<typeof PreviewRequestSchema>;
