import type { Character } from "@mumu/shared";
import { cacheKey, type DiskCache } from "./cache.js";
import type { ReasonGenerate } from "./gemini.js";
import { geminiJsonSchema } from "./jsonSchema.js";
import type { MergedLine } from "./merge.js";
import { REASON_PROMPT_VERSION, ReasoningResultSchema, type ReasoningResult } from "./reasonSchema.js";
import { withBackoff, type Sleep } from "./retry.js";

const NAMESPACE = "reasoning";

/** docs/PROMPTS.md §2. Bump REASON_PROMPT_VERSION when this text changes. */
const REASON_INSTRUCTIONS = `You are the casting director for a voiced comic. Using the transcript and the known cast:

1. Speakers. For every speech or thought line, choose a speaker: a known cast id, or a new character key like new_1. Use the same key every time that new character speaks. Use speakerCastId and speakerHint as evidence, along with the conversation flow: replies alternate, and a character addressed by name is usually the listener, not the speaker. The same character looks different in different coloured lighting (hair and clothes can read as brown, purple or green), so match on outfit, hat and companions, and prefer a known cast id over a new character. If you cannot tell, use null. Return one speakers entry for each speech or thought line (by its order number) and none for narration or sfx lines.
2. New characters. For each new key give: key, name (a real name if the dialogue reveals it, otherwise a short descriptive label), description (visual, from the hints, for recognizing them in later chapters), and voiceSlot (one of narrator, male_young, male_adult, male_deep, male_elder, female_young, female_adult, female_cold, female_elder, child). Use male_deep for villains and gruff fighters, and female_cold for cold or aloof women. Only list characters that speak at least one line. Never list a known cast member as new.
3. Music regions. Split the chapter into contiguous regions covering every line from first to last: the first region starts at the first order number, each region starts at the order after the previous one ends, and the last region ends at the last order number. Give each region startOrder, endOrder, mood (calm, tense, battle, climax, romance, sad, comedic, mystery) and intensity (1-3). Avoid flicker: do not change mood more often than every ~6 lines unless the scene clearly shifts (a fight starts, a reveal, a death). Use climax for at most one peak per chapter.

Narration and caption lines belong to the story's unseen narrator. The narrator is not a character: never create a character for it and never give it a speaker.`;

/** Cast as the prompt and the cache key see it: ids, names, descriptions (never voices). */
export function reasonCastBlock(cast: readonly Character[]): string {
  if (cast.length === 0) return "KNOWN CAST: (none yet)";
  return ["KNOWN CAST:", ...cast.map((c) => `- ${c.id} | ${c.name} | ${c.description}`)].join("\n");
}

/** `order | kind | text | speakerHint | speakerCastId | mood/intensity`, one line per cue. */
export function transcriptBlock(lines: readonly MergedLine[]): string {
  const clean = (s: string) => s.replace(/\s*\|\s*/g, " / ").replace(/\s+/g, " ").trim();
  return [
    "TRANSCRIPT (order | kind | text | speakerHint | speakerCastId | segment mood/intensity):",
    ...lines.map((l) =>
      [l.order, l.kind, clean(l.text), l.speakerHint ? clean(l.speakerHint) : "-", l.speakerCastId ?? "-", `${l.mood}/${l.intensity}`].join(" | "),
    ),
  ].join("\n");
}

export function buildReasonPrompt(lines: readonly MergedLine[], cast: readonly Character[], previousProblem?: string): string {
  const parts = [REASON_INSTRUCTIONS, reasonCastBlock(cast), transcriptBlock(lines)];
  if (previousProblem) parts.push(`Your previous answer was rejected: ${previousProblem}\nFix that and answer again.`);
  return parts.join("\n\n");
}

export function reasonJsonSchema(): unknown {
  return geminiJsonSchema(ReasoningResultSchema);
}

/**
 * Checks a schema-valid answer against the transcript and cast. Returns the first problem, or
 * null. Everything here is something code cannot repair without guessing.
 */
export function findReasoningProblem(result: ReasoningResult, lines: readonly MergedLine[], cast: readonly Character[]): string | null {
  const first = lines[0]?.order;
  const last = lines[lines.length - 1]?.order;
  if (first === undefined || last === undefined) return "the transcript is empty";

  const keys = new Set<string>();
  for (const nc of result.newCharacters) {
    if (keys.has(nc.key)) return `new character key ${nc.key} is listed twice`;
    if (cast.some((c) => c.id === nc.key)) return `new character key ${nc.key} is a known cast id`;
    keys.add(nc.key);
  }

  const byOrder = new Map(lines.map((l) => [l.order, l]));
  const spoken = new Set<number>();
  for (const { order, speaker } of result.speakers) {
    const line = byOrder.get(order);
    if (!line) return `speakers has order ${order}, which is not in the transcript`;
    if (line.kind !== "speech" && line.kind !== "thought") return `speakers has order ${order}, a ${line.kind} line (only speech and thought lines get a speaker)`;
    if (spoken.has(order)) return `speakers lists order ${order} twice`;
    spoken.add(order);
    if (speaker !== null && !keys.has(speaker) && !cast.some((c) => c.id === speaker)) {
      return `order ${order} names speaker "${speaker}", which is neither a known cast id nor a listed new character key`;
    }
  }
  for (const l of lines) {
    if ((l.kind === "speech" || l.kind === "thought") && !spoken.has(l.order)) return `speech/thought line ${l.order} has no speakers entry`;
  }

  const { regions } = result;
  if (regions.length === 0) return "regions is empty";
  if (regions[0]!.startOrder !== first) return `the first region must start at order ${first}, not ${regions[0]!.startOrder}`;
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i]!;
    if (r.endOrder < r.startOrder) return `region ${i + 1} ends (${r.endOrder}) before it starts (${r.startOrder})`;
    const next = regions[i + 1];
    if (next && next.startOrder !== r.endOrder + 1) return `region ${i + 2} must start at order ${r.endOrder + 1}, not ${next.startOrder}`;
  }
  if (regions[regions.length - 1]!.endOrder !== last) return `the last region must end at order ${last}, not ${regions[regions.length - 1]!.endOrder}`;
  return null;
}

export interface ReasonContext {
  model: string;
  cast: readonly Character[];
  cache: DiskCache;
  generate: ReasonGenerate;
  sleep?: Sleep;
  log?: (line: string) => void;
}

function parseReasoning(text: string): ReasoningResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`response is not JSON: ${(err as Error).message}`);
  }
  const parsed = ReasoningResultSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(`response failed validation at ${first?.path.join(".") || "(root)"}: ${first?.message}`);
  }
  return parsed.data;
}

/** The reasoning pass for a chapter: cache hit, or API call (backoff on 429/5xx, one retry on a bad answer). */
export async function reasonChapter(lines: readonly MergedLine[], ctx: ReasonContext): Promise<ReasoningResult> {
  const log = ctx.log ?? console.log;
  const label = `reasoning (${lines.length} lines)`;
  const transcript = transcriptBlock(lines);
  const key = cacheKey([ctx.model, REASON_PROMPT_VERSION, transcript, reasonCastBlock(ctx.cast)]);

  const cached = await ctx.cache.read(NAMESPACE, key);
  if (cached) {
    try {
      const result = parseReasoning(cached.toString("utf8"));
      const problem = findReasoningProblem(result, lines, ctx.cast);
      if (problem) throw new Error(problem);
      log(`cache hit  ${label}`);
      return result;
    } catch (err) {
      throw new Error(`${label}: cached result ${key.slice(0, 12)} is corrupt (${(err as Error).message}); delete it from CACHE_DIR/${NAMESPACE}`);
    }
  }

  const jsonSchema = reasonJsonSchema();
  let lastProblem: string | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    log(`API call   ${label}${attempt > 1 ? ", retry after bad response" : ""}`);
    const prompt = buildReasonPrompt(lines, ctx.cast, lastProblem);
    let text: string;
    try {
      text = await withBackoff(() => ctx.generate({ model: ctx.model, prompt, jsonSchema }), {
        sleep: ctx.sleep,
        onRetry: (n, delay, err) => log(`retry ${n}  ${label} in ${delay} ms: ${(err as Error).message.slice(0, 200)}`),
      });
    } catch (err) {
      throw new Error(`${label} failed: ${(err as Error).message}`);
    }
    try {
      const result = parseReasoning(text);
      const problem = findReasoningProblem(result, lines, ctx.cast);
      if (problem) throw new Error(problem);
      await ctx.cache.write(NAMESPACE, key, JSON.stringify(result));
      return result;
    } catch (err) {
      lastProblem = (err as Error).message;
    }
  }
  throw new Error(`${label} failed validation twice: ${lastProblem}`);
}
