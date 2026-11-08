import { IntensitySchema, MoodSchema, VoiceSlotSchema } from "@mumu/shared";
import { z } from "zod";

/** Bump whenever the reasoning prompt or this schema changes, so cached results are ignored. */
export const REASON_PROMPT_VERSION = "reason-v4";

/** A character the chapter introduces. `key` (new_1, new_2, ...) is local to this response. */
export const NewCharacterDraftSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  voiceSlot: VoiceSlotSchema,
});
export type NewCharacterDraft = z.infer<typeof NewCharacterDraftSchema>;

export const ReasoningResultSchema = z.object({
  /** One entry per speech/thought line: a known cast id, a new character key, or null if unknowable. */
  speakers: z.array(z.object({ order: z.number().int(), speaker: z.string().min(1).nullable() })),
  newCharacters: z.array(NewCharacterDraftSchema),
  /** Contiguous music regions over line orders, first line to last. */
  regions: z.array(
    z.object({
      startOrder: z.number().int(),
      endOrder: z.number().int(),
      mood: MoodSchema,
      intensity: IntensitySchema,
    }),
  ),
});
export type ReasoningResult = z.infer<typeof ReasoningResultSchema>;
