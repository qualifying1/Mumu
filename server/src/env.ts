import { z } from "zod";

// Only what the running server needs today. Pipeline variables (GEMINI_API_KEY, models,
// CACHE_DIR, concurrency) are validated by the stages that use them (see CONTRACT §8).
const serverEnvSchema = z.object({
  PORT: z.coerce.number().int().positive(),
  CORS_ORIGIN: z
    .string()
    .min(1)
    .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(raw: NodeJS.ProcessEnv): ServerEnv {
  const result = serverEnvSchema.safeParse(raw);
  if (!result.success) {
    const fields = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server environment (${fields}). Copy server/.env.example to server/.env and fill it in.`);
  }
  return result.data;
}
