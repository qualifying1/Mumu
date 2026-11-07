import type { Character } from "@mumu/shared";
import pLimit from "p-limit";
import { cacheKey, type DiskCache } from "./cache.js";
import type { VisionGenerate } from "./gemini.js";
import { geminiJsonSchema } from "./jsonSchema.js";
import { withBackoff, type Sleep } from "./retry.js";
import type { Segment } from "./slice.js";
import { VISION_PROMPT_VERSION, VisionResultSchema, type VisionResult } from "./visionSchema.js";

const NAMESPACE = "vision";

/** docs/PROMPTS.md §1. Bump VISION_PROMPT_VERSION when this text changes. */
const VISION_INSTRUCTIONS = `You are reading one horizontal slice of a comic. Find every piece of text a reader would read: speech bubbles, thought bubbles, narration boxes/captions, and sound-effect lettering. Be exhaustive: a dense page has 8-15 items in total, so even one slice of it can hold several. Black jagged bubbles with white text are speech or spells. List every one.

For each item return:
- kind: speech, thought, narration, or sfx.
- text: exactly as lettered. Join line breaks with spaces. Keep punctuation. Do not translate, correct, or summarize.
- box: [ymin, xmin, ymax, xmax] as four numbers normalized 0-1000 relative to THIS slice.
- emotion: one of neutral, happy, angry, sad, scared, surprised, determined, tender, smug. Judge from the wording, the lettering, and the speaker's face.
- delivery: shout (bold, large, or jagged lettering, or a spiky bubble), whisper (small or dotted lettering, or a dashed bubble), otherwise normal.
- speakerHint: a short visual description of the character the bubble's tail points to (hair, clothing, distinctive features), or null if no tail or speaker is visible. A spell is spoken by the character casting it, so its tail points to that character's hand or mouth.
- speakerCastId: the id from KNOWN CAST only if you are confident it is that character; otherwise null. Never guess.
- sfxTag (sfx only, otherwise null): the closest of punch, sword_clash, explosion, whoosh, footsteps, door, heartbeat, gasp, crowd, magic, or null if none fits.

Also return for the whole slice: mood (calm, tense, battle, climax, romance, sad, comedic, mystery) and intensity (1-3), judged from the art (action lines, colors, expressions) as well as the text.

List items in reading order: top to bottom, and left to right within the same row. Ignore watermarks, credits, page numbers, logos, and signs that are part of the background unless a character reads them aloud. Ignore all text on credits, donation, patron, sponsor, license or promotional pages (thank-you lists, "support the author" notes, website addresses), even when it is lettered like narration; return an empty items list for such a slice. If the slice contains no text, return an empty items list.`;

/** Cast as the prompt and the cache key see it. */
export function castBlock(cast: Character[]): string {
  if (cast.length === 0) return "KNOWN CAST: (none yet)";
  return ["KNOWN CAST:", ...cast.map((c) => `- ${c.id} | ${c.name} | ${c.description}`)].join("\n");
}

export function buildVisionPrompt(segmentNumber: number, total: number, cast: Character[]): string {
  return `${VISION_INSTRUCTIONS}\n\n${castBlock(cast)}\n\nThis is segment ${segmentNumber} of ${total}.`;
}

/** JSON Schema sent as responseJsonSchema. */
export function visionJsonSchema(): unknown {
  return geminiJsonSchema(VisionResultSchema);
}

export interface VisionContext {
  model: string;
  cast: Character[];
  cache: DiskCache;
  generate: VisionGenerate;
  sleep?: Sleep;
  log?: (line: string) => void;
}

export interface RawSegmentResult {
  segment: Pick<Segment, "index" | "pageIndex" | "top" | "height" | "pageWidth" | "pageHeight">;
  result: VisionResult;
}

function parseVision(text: string): VisionResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`response is not JSON: ${(err as Error).message}`);
  }
  const parsed = VisionResultSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(`response failed validation at ${first?.path.join(".") || "(root)"}: ${first?.message}`);
  }
  return parsed.data;
}

/** One segment: cache hit, or API call (with backoff on 429/5xx, one retry on a bad response). */
export async function analyzeSegment(segment: Segment, total: number, ctx: VisionContext): Promise<VisionResult> {
  const log = ctx.log ?? console.log;
  const label = `vision segment ${segment.index + 1}/${total} (page ${segment.pageIndex + 1})`;
  const key = cacheKey([ctx.model, VISION_PROMPT_VERSION, segment.image, castBlock(ctx.cast)]);

  const cached = await ctx.cache.read(NAMESPACE, key);
  if (cached) {
    try {
      const result = parseVision(cached.toString("utf8"));
      log(`cache hit  ${label}`);
      return result;
    } catch (err) {
      throw new Error(`${label}: cached result ${key.slice(0, 12)} is corrupt (${(err as Error).message}); delete it from CACHE_DIR/${NAMESPACE}`);
    }
  }

  const prompt = buildVisionPrompt(segment.index + 1, total, ctx.cast);
  const jsonSchema = visionJsonSchema();
  let lastProblem = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    log(`API call   ${label} (${(segment.image.length / 1024).toFixed(0)} KB${attempt > 1 ? ", retry after bad response" : ""})`);
    let text: string;
    try {
      text = await withBackoff(() => ctx.generate({ model: ctx.model, image: segment.image, prompt, jsonSchema }), {
        sleep: ctx.sleep,
        onRetry: (n, delay, err) => log(`retry ${n}  ${label} in ${delay} ms: ${(err as Error).message.slice(0, 200)}`),
      });
    } catch (err) {
      throw new Error(`${label} failed: ${(err as Error).message}`);
    }
    try {
      const result = parseVision(text);
      await ctx.cache.write(NAMESPACE, key, JSON.stringify(result));
      return result;
    } catch (err) {
      lastProblem = (err as Error).message;
    }
  }
  throw new Error(`${label} failed validation twice: ${lastProblem}`);
}

/** All segments with bounded concurrency. Stops starting new calls after the first failure. */
export async function analyzeChapter(
  segments: Segment[],
  ctx: VisionContext,
  concurrency: number,
  onProgress?: (done: number, total: number) => void,
): Promise<RawSegmentResult[]> {
  const limit = pLimit(concurrency);
  let done = 0;
  let failed = false;
  const results = await Promise.all(
    segments.map((segment) =>
      limit(async () => {
        if (failed) throw new Error("skipped after an earlier segment failed");
        try {
          const result = await analyzeSegment(segment, segments.length, ctx);
          onProgress?.(++done, segments.length);
          const { index, pageIndex, top, height, pageWidth, pageHeight } = segment;
          return { segment: { index, pageIndex, top, height, pageWidth, pageHeight }, result };
        } catch (err) {
          failed = true;
          throw err;
        }
      }),
    ),
  );
  return results;
}
