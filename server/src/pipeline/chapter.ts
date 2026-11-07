import type { Character, JobState, VoiceProfile } from "@mumu/shared";
import type { DiskCache } from "./cache.js";
import { castNewCharacters } from "./cast.js";
import { assembleDraft, type DraftPackage } from "./draft.js";
import type { ReasonGenerate, VisionGenerate } from "./gemini.js";
import { mergeSegments, type MergedLine } from "./merge.js";
import { reasonChapter } from "./reason.js";
import type { Sleep } from "./retry.js";
import { sliceChapter, type PageInput } from "./slice.js";
import { analyzeChapter, type RawSegmentResult } from "./vision.js";

export interface ChapterProgress {
  state: JobState;
  message: string;
  done?: number;
  total?: number;
}

export interface ChapterInput {
  seriesId: string;
  chapterId: string;
  /** Normalized page images in reading order. */
  pages: PageInput[];
  /** The series' known cast (used for recognition and the casting rule). */
  cast: readonly Character[];
  profiles: readonly VoiceProfile[];
}

export interface ChapterDeps {
  models: { vision: string; reasoning: string; tts: string };
  cache: DiskCache;
  visionGenerate: VisionGenerate;
  reasonGenerate: ReasonGenerate;
  visionConcurrency: number;
  sleep?: Sleep;
  log?: (line: string) => void;
  onProgress?: (p: ChapterProgress) => void;
  newCharacterId?: () => string;
}

export interface ChapterDraftResult {
  draft: DraftPackage;
  /** The merged transcript, for printing and debugging. */
  lines: MergedLine[];
  raw: RawSegmentResult[];
  segmentCount: number;
}

/**
 * slice → vision → merge → reason → cast → draft package (no audio). The one place the stages
 * are wired together: the fixture CLI and the jobs API both call this. A3 adds TTS and packaging.
 */
export async function buildChapterDraft(input: ChapterInput, deps: ChapterDeps): Promise<ChapterDraftResult> {
  const progress = deps.onProgress ?? (() => {});

  progress({ state: "slicing", message: `Slicing ${input.pages.length} pages` });
  const segments = await sliceChapter(input.pages);
  progress({ state: "slicing", message: `Sliced into ${segments.length} segments` });

  const raw = await analyzeChapter(
    segments,
    { model: deps.models.vision, cast: [...input.cast], cache: deps.cache, generate: deps.visionGenerate, sleep: deps.sleep, log: deps.log },
    deps.visionConcurrency,
    (done, total) => progress({ state: "analyzing", message: `Analyzing segment ${done}/${total}`, done, total }),
  );

  progress({ state: "reasoning", message: "Merging the transcript" });
  const lines = mergeSegments(raw);
  if (lines.length === 0) throw new Error("merge: no readable text was found in this chapter");

  progress({ state: "reasoning", message: `Working out who says what (${lines.length} lines)` });
  const reasoning = await reasonChapter(lines, {
    model: deps.models.reasoning,
    cast: input.cast,
    cache: deps.cache,
    generate: deps.reasonGenerate,
    sleep: deps.sleep,
    log: deps.log,
  });

  progress({ state: "casting", message: "Casting voices" });
  const usedKeys = new Set(reasoning.speakers.map((s) => s.speaker).filter((s): s is string => s !== null));
  const { newCharacters, idByKey } = castNewCharacters({
    drafts: reasoning.newCharacters,
    usedKeys,
    existingCast: input.cast,
    profiles: input.profiles,
    seriesId: input.seriesId,
    chapterId: input.chapterId,
    newId: deps.newCharacterId,
  });

  const draft = assembleDraft({
    seriesId: input.seriesId,
    chapterId: input.chapterId,
    models: deps.models,
    lines,
    reasoning,
    newCharacters,
    idByKey,
  });
  return { draft, lines, raw, segmentCount: segments.length };
}
