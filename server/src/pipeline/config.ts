import { z } from "zod";

// Pipeline variables (CONTRACT §8). Validated where the pipeline starts, so the plain
// HTTP server can still boot without a Gemini key.
const pipelineEnvSchema = z.object({
  GEMINI_API_KEY: z.string().min(1),
  VISION_MODEL: z.string().min(1),
  REASONING_MODEL: z.string().min(1),
  TTS_MODEL: z.string().min(1),
  CACHE_DIR: z.string().min(1),
  VISION_CONCURRENCY: z.coerce.number().int().positive(),
  TTS_CONCURRENCY: z.coerce.number().int().positive(),
});

export type PipelineEnv = z.infer<typeof pipelineEnvSchema>;

export function parsePipelineEnv(raw: NodeJS.ProcessEnv): PipelineEnv {
  const result = pipelineEnvSchema.safeParse(raw);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((i) => i.path.join(".")))].join(", ");
    throw new Error(`Invalid pipeline environment (${fields}). Fill them in server/.env (see server/.env.example).`);
  }
  return result.data;
}
