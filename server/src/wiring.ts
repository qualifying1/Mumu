import type { Models } from "@mumu/shared";
import type { AppDeps } from "./app.js";
import { DiskCache } from "./pipeline/cache.js";
import { buildChapter } from "./pipeline/chapter.js";
import type { PipelineEnv } from "./pipeline/config.js";
import { createGeminiReasonGenerate, createGeminiTtsGenerate, createGeminiVisionGenerate } from "./pipeline/gemini.js";
import { MOCK_TTS_MODEL, createMockTtsGenerate } from "./pipeline/mockTts.js";
import { previewClip } from "./preview.js";

/**
 * Connect the HTTP app to the real pipeline: the same `buildChapter` the fixture CLI calls, with the
 * Gemini adapters, the shared disk cache and the concurrency from env. With `mockTts`, only the TTS
 * call is replaced (and the TTS model is reported as "mock-tts"), so vision and reasoning stay real.
 */
export function createPipelineDeps(env: PipelineEnv, opts: { mockTts: boolean }): Pick<AppDeps, "models" | "runChapter" | "previewClip"> {
  const models: Models = { vision: env.VISION_MODEL, reasoning: env.REASONING_MODEL, tts: opts.mockTts ? MOCK_TTS_MODEL : env.TTS_MODEL };
  const cache = new DiskCache(env.CACHE_DIR);
  const ttsGenerate = opts.mockTts ? createMockTtsGenerate() : createGeminiTtsGenerate(env.GEMINI_API_KEY);

  return {
    models,
    runChapter: async (input, onProgress) => {
      const { pkg } = await buildChapter(input, {
        models,
        cache,
        visionGenerate: createGeminiVisionGenerate(env.GEMINI_API_KEY),
        reasonGenerate: createGeminiReasonGenerate(env.GEMINI_API_KEY),
        ttsGenerate,
        visionConcurrency: env.VISION_CONCURRENCY,
        ttsConcurrency: env.TTS_CONCURRENCY,
        onProgress,
      });
      return pkg;
    },
    previewClip: (profile, text) => previewClip(profile, text, { model: models.tts, cache, generate: ttsGenerate }),
  };
}
