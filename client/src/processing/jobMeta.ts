// Builds the `meta` field of POST /jobs (CONTRACT §4). Pure and validated, so a malformed request fails here, loudly.
import { JobMetaSchema, type Character, type JobMeta, type VoiceProfile } from "@mumu/shared";

export interface JobMetaInput {
  seriesId: string;
  chapterId: string;
  /** Every character of this series. Each one carries its own `voice` snapshot, which the server uses as sent. */
  cast: readonly Character[];
  /** All 30 profiles, as currently tuned in the Voices tab. New characters copy one; narrator_1 voices the narration. */
  profiles: readonly VoiceProfile[];
}

export function buildJobMeta(input: JobMetaInput): JobMeta {
  const cast = input.cast.filter((c) => c.seriesId === input.seriesId);
  if (!input.profiles.some((p) => p.id === "narrator_1")) {
    throw new Error("The narrator voice profile (narrator_1) is missing from the library.");
  }
  return JobMetaSchema.parse({
    seriesId: input.seriesId,
    chapterId: input.chapterId,
    cast,
    profiles: input.profiles,
  });
}
