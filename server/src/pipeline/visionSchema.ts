import { CueKindSchema, DeliverySchema, EmotionSchema, IntensitySchema, MoodSchema, SfxTagSchema } from "@mumu/shared";
import { z } from "zod";

/** Bump whenever the vision prompt or this schema changes, so cached results are ignored. */
export const VISION_PROMPT_VERSION = "vision-v1";

/**
 * Box as Gemini returns it: [ymin, xmin, ymax, xmax], integers-ish in 0–1000, relative to
 * the segment (NOT the page). A2 maps it to page fractions. Confirm order/scale with the
 * debug overlay before trusting it (CLAUDE.md gotcha).
 */
// A fixed-length array (not a tuple) so the JSON Schema sent to Gemini is plain minItems/maxItems.
const SegmentBoxSchema = z
  .array(z.number().min(0).max(1000))
  .length(4)
  .refine(([ymin, xmin, ymax, xmax]) => ymin! < ymax! && xmin! < xmax!, { message: "box needs ymin < ymax and xmin < xmax" });

export const VisionItemSchema = z.object({
  kind: CueKindSchema,
  text: z.string().min(1),
  box: SegmentBoxSchema,
  emotion: EmotionSchema,
  delivery: DeliverySchema,
  speakerHint: z.string().nullable(),
  speakerCastId: z.string().nullable(),
  sfxTag: SfxTagSchema.nullable(),
});
export type VisionItem = z.infer<typeof VisionItemSchema>;

export const VisionResultSchema = z.object({
  items: z.array(VisionItemSchema),
  mood: MoodSchema,
  intensity: IntensitySchema,
});
export type VisionResult = z.infer<typeof VisionResultSchema>;
