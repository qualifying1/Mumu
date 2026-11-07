import type { Models } from "@mumu/shared";
import type { AppDeps } from "./app.js";
import { DiskCache } from "./pipeline/cache.js";
import { buildChapter } from "./pipeline/chapter.js";
import type { PipelineEnv } from "./pipeline/config.js";
import { createGeminiReasonGenerate, createGeminiTtsGenerate, createGeminiVisionGenerate, type TtsGenerate } from "./pipeline/gemini.js";
import { MOCK_TTS_MODEL, createMockTtsGenerate } from "./pipeline/mockTts.js";
import { previewClip } from "./preview.js";

/** `MOCK_TTS=1` replaces only the TTS call with a beep (for working while the quota or budget is short). Never in production. */
export const mockTtsRequested = (env: NodeJS.ProcessEnv): boolean => env.MOCK_TTS === "1";

/**
 * The TTS model name and call, real or mocked. A mocked call reports the model as "mock-tts", which is
 * part of every TTS cache key, so mock clips never mix with real ones. The server and the fixture CLI both use this.
 */
export function createTtsAdapter(env: Pick<PipelineEnv, "TTS_MODEL" | "GEMINI_API_KEY">, mockTts: boolean): { model: string; generate: TtsGenerate } {
  return mockTts ? { model: MOCK_TTS_MODEL, generate: createMockTtsGenerate() } : { model: env.TTS_MODEL, generate: createGeminiTtsGenerate(env.GEMINI_API_KEY) };
}

/**
 * Connect the HTTP app to the real pipeline: the same `buildChapter` the fixture CLI calls, with the
 * Gemini adapters, the shared disk cache and the concurrency from env. With `mockTts`, only the TTS
 * call is replaced, so vision and reasoning stay real.
 */
export function createPipelineDeps(env: PipelineEnv, opts: { mockTts: boolean }): Pick<AppDeps, "models" | "runChapter" | "previewClip"> {
  const tts = createTtsAdapter(env, opts.mockTts);
  const models: Models = { vision: env.VISION_MODEL, reasoning: env.REASONING_MODEL, tts: tts.model };
  const cache = new DiskCache(env.CACHE_DIR);

  return {
    models,
    runChapter: async (input, onProgress) => {
      const { pkg } = await buildChapter(input, {
        models,
        cache,
        visionGenerate: createGeminiVisionGenerate(env.GEMINI_API_KEY),
        reasonGenerate: createGeminiReasonGenerate(env.GEMINI_API_KEY),
        ttsGenerate: tts.generate,
        visionConcurrency: env.VISION_CONCURRENCY,
        ttsConcurrency: env.TTS_CONCURRENCY,
        onProgress,
      });
      return pkg;
    },
    previewClip: (profile, text) => previewClip(profile, text, { model: models.tts, cache, generate: tts.generate }),
  };
}
