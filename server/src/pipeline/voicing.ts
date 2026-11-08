import { ApiError } from "@google/genai";
import { CONTRACT_VERSION, ChapterPackageSchema, type AudioClip, type Character, type ChapterPackage, type Cue, type VoiceProfile } from "@mumu/shared";
import pLimit from "p-limit";
import { encodeMp3, wavToPcm } from "./audio.js";
import { cacheKey, type DiskCache } from "./cache.js";
import type { DraftPackage } from "./draft.js";
import type { TtsGenerate } from "./gemini.js";
import { withBackoff, type Sleep } from "./retry.js";
import { hasSpeakableText, resolveCueVoice, type VoiceSpec } from "./tts.js";

const NAMESPACE = "tts";

/** One clip to voice: a cue's line. */
export interface ClipPlan {
  audioId: string;
  cueId: string;
  text: string;
  spec: VoiceSpec;
}

export const cueAudioId = (chapterId: string, order: number) => `aud_${chapterId}_${order}`;

/**
 * Which clips a chapter needs: one per speech/thought/narration cue with something to say
 * (CONTRACT §5: clips = voiced cues). SFX and cues without letters or digits stay silent.
 */
export function planClips(draft: Pick<DraftPackage, "chapterId" | "cues">, characters: readonly Character[], profiles: readonly VoiceProfile[]): ClipPlan[] {
  const plans: ClipPlan[] = [];
  for (const cue of draft.cues) {
    if (cue.kind === "sfx" || !hasSpeakableText(cue.text)) continue;
    plans.push({ audioId: cueAudioId(draft.chapterId, cue.order), cueId: cue.id, text: cue.text, spec: resolveCueVoice(cue, characters, profiles) });
  }
  return plans;
}

export interface TtsContext {
  model: string;
  cache: DiskCache;
  generate: TtsGenerate;
  sleep?: Sleep;
  log?: (line: string) => void;
}

const preview = (text: string) => (text.length > 40 ? `${text.slice(0, 37)}...` : text);

/**
 * The raw WAV for (model, voice, style, text): cache hit, or one API call. Speed and pitch are not
 * part of the key or the request (CONTRACT §9). 429/5xx back off; a reply that is not usable audio
 * is retried once; any other API error (bad model, bad request) fails at once.
 */
export async function ttsWav(spec: Pick<VoiceSpec, "voice" | "style">, text: string, ctx: TtsContext): Promise<Buffer> {
  const log = ctx.log ?? console.log;
  const label = `tts ${spec.voice} "${preview(text)}"`;
  const key = cacheKey([ctx.model, spec.voice, spec.style, text]);

  const cached = await ctx.cache.read(NAMESPACE, key, "wav");
  if (cached) {
    try {
      wavToPcm(cached);
    } catch (err) {
      throw new Error(`${label}: cached clip ${key.slice(0, 12)} is corrupt (${(err as Error).message}); delete it from CACHE_DIR/${NAMESPACE}`);
    }
    log(`cache hit  ${label}`);
    return cached;
  }

  let lastProblem = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    log(`API call   ${label}${attempt > 1 ? ", retry after bad response" : ""}`);
    let wav: Buffer;
    try {
      wav = await withBackoff(() => ctx.generate({ model: ctx.model, voice: spec.voice, style: spec.style, text }), {
        sleep: ctx.sleep,
        onRetry: (n, delay, err) => log(`retry ${n}  ${label} in ${delay} ms: ${(err as Error).message.slice(0, 200)}`),
      });
      wavToPcm(wav);
    } catch (err) {
      if (err instanceof ApiError) throw new Error(`${label} failed: ${err.message}`);
      lastProblem = (err as Error).message;
      continue;
    }
    await ctx.cache.write(NAMESPACE, key, wav, "wav");
    return wav;
  }
  throw new Error(`${label} failed twice: ${lastProblem}`);
}

export interface VoicingContext extends TtsContext {
  concurrency: number;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Draft package -> full ChapterPackage: TTS every planned clip (p-limit TTS_CONCURRENCY), encode each
 * to MP3 with the speed and pitch of the voice used, link the cues, and validate the result.
 * Identical (voice, style, text) requests inside one run share one call.
 */
export async function voiceChapter(
  draft: DraftPackage,
  input: { cast: readonly Character[]; profiles: readonly VoiceProfile[] },
  ctx: VoicingContext,
): Promise<ChapterPackage> {
  const characters = [...input.cast, ...draft.newCharacters];
  const plans = planClips(draft, characters, input.profiles);
  const limit = pLimit(ctx.concurrency);
  const inFlight = new Map<string, Promise<Buffer>>();
  let done = 0;
  let failure: unknown;
  ctx.onProgress?.(0, plans.length);

  // On the first failure, clips that have not started are skipped and the running ones are awaited,
  // so nothing keeps calling TTS or writing the cache after the chapter has failed.
  const settled = await Promise.allSettled(
    plans.map((plan) =>
      limit(async (): Promise<AudioClip> => {
        if (failure !== undefined) throw failure;
        const key = cacheKey([plan.spec.voice, plan.spec.style, plan.text]);
        let pending = inFlight.get(key);
        if (!pending) {
          pending = ttsWav(plan.spec, plan.text, ctx);
          inFlight.set(key, pending);
        }
        try {
          const wav = await pending;
          const { mp3, durationMs } = await encodeMp3(wav, { speed: plan.spec.speed, pitch: plan.spec.pitch });
          ctx.onProgress?.(++done, plans.length);
          return { id: plan.audioId, mime: "audio/mpeg", durationMs, dataBase64: mp3.toString("base64") };
        } catch (err) {
          failure ??= err;
          throw err;
        }
      }),
    ),
  );
  if (failure !== undefined) throw failure;
  const clips = settled.map((s) => (s as PromiseFulfilledResult<AudioClip>).value);

  const audioIdByCue = new Map(plans.map((p) => [p.cueId, p.audioId]));
  const cues: Cue[] = draft.cues.map((cue) => ({ ...cue, audioId: audioIdByCue.get(cue.id) ?? null }));

  return ChapterPackageSchema.parse({
    contractVersion: CONTRACT_VERSION,
    seriesId: draft.seriesId,
    chapterId: draft.chapterId,
    models: draft.models,
    newCharacters: draft.newCharacters,
    cues,
    regions: draft.regions,
    audio: clips,
  });
}
