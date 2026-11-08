// Fixture CLI: run the whole pipeline on a folder of page images and write the voiced package.
//   npm run fixture -- fixtures/ch1
//   npm run fixture -- fixtures/ch2 --cast fixtures/out/ch1.json     (--cast is repeatable)
// Writes fixtures/out/<name>.raw.json (per-segment vision results), fixtures/out/<name>.json (the
// ChapterPackage, audio included) and fixtures/out/<name>-audio/*.mp3 (one file per clip, to play),
// then prints the transcript (`order. [speaker] text`) and the recap.
import { DEFAULT_PROFILES, type Character } from "@mumu/shared";
import dotenv from "dotenv";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DiskCache } from "./pipeline/cache.js";
import { loadCastFromPackages } from "./pipeline/cast.js";
import { buildChapter } from "./pipeline/chapter.js";
import type { DraftPackage } from "./pipeline/draft.js";
import { createGeminiReasonGenerate, createGeminiTtsGenerate, createGeminiVisionGenerate } from "./pipeline/gemini.js";
import type { MergedLine } from "./pipeline/merge.js";
import { parsePipelineEnv } from "./pipeline/config.js";
import { REASON_PROMPT_VERSION } from "./pipeline/reasonSchema.js";
import { normalizePage } from "./pipeline/slice.js";
import { VISION_PROMPT_VERSION } from "./pipeline/visionSchema.js";

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const serverDir = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(serverDir, "..");

function usage(): never {
  throw new Error("usage: npm run fixture -- <folder of page images> [--cast <package.json>]...   (example: npm run fixture -- fixtures/ch2 --cast fixtures/out/ch1.json)");
}

function parseArgs(argv: string[]): { folder: string; castFiles: string[] } {
  // npm runs workspace scripts from server/, so resolve relative paths against where the user typed the command.
  const base = process.env.INIT_CWD ?? process.cwd();
  const positional: string[] = [];
  const castFiles: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--cast") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) usage();
      castFiles.push(path.resolve(base, value));
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown option ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length !== 1) usage();
  return { folder: path.resolve(base, positional[0]!), castFiles };
}

/** `order. [speaker] text`; speaker is the character's name, "Narrator" for narration, "Unknown" when no speaker could be told, SFX for sound effects. */
export function transcriptLines(lines: readonly MergedLine[], draft: DraftPackage, cast: readonly Character[]): string[] {
  const names = new Map([...cast, ...draft.newCharacters].map((c) => [c.id, c.name]));
  return draft.cues.map((cue, i) => {
    const speaker =
      cue.kind === "sfx"
        ? "SFX"
        : cue.kind === "narration"
          ? "Narrator"
          : cue.characterId
            ? (names.get(cue.characterId) ?? cue.characterId)
            : "Unknown";
    const tag = cue.kind === "thought" ? " (thought)" : "";
    return `${cue.order}. [${speaker}${tag}] ${lines[i]!.text}`;
  });
}

async function main() {
  const { folder, castFiles } = parseArgs(process.argv.slice(2));
  dotenv.config({ path: path.join(serverDir, ".env"), quiet: true });
  const env = parsePipelineEnv(process.env);

  const files = (await readdir(folder)).filter((f) => IMAGE_EXT.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (files.length === 0) throw new Error(`no images (.jpg/.png/.webp) in ${folder}`);

  const name = path.basename(folder);
  const { seriesId, cast } = castFiles.length > 0 ? await loadCastFromPackages(castFiles) : { seriesId: "series_fixture", cast: [] };
  console.log(
    `fixture ${name}: ${files.length} pages, vision ${env.VISION_MODEL} (${VISION_PROMPT_VERSION}), reasoning ${env.REASONING_MODEL} (${REASON_PROMPT_VERSION}), ` +
      `known cast ${cast.length}${castFiles.length > 0 ? ` from ${castFiles.length} package(s)` : ""}`,
  );

  const pages = [];
  for (const file of files) pages.push({ bytes: await normalizePage(await readFile(path.join(folder, file))) });

  const { pkg, draft, lines, raw, segmentCount } = await buildChapter(
    { seriesId, chapterId: name, pages, cast, profiles: DEFAULT_PROFILES },
    {
      models: { vision: env.VISION_MODEL, reasoning: env.REASONING_MODEL, tts: env.TTS_MODEL },
      cache: new DiskCache(env.CACHE_DIR),
      visionGenerate: createGeminiVisionGenerate(env.GEMINI_API_KEY),
      reasonGenerate: createGeminiReasonGenerate(env.GEMINI_API_KEY),
      ttsGenerate: createGeminiTtsGenerate(env.GEMINI_API_KEY),
      visionConcurrency: env.VISION_CONCURRENCY,
      ttsConcurrency: env.TTS_CONCURRENCY,
      onProgress: (p) => {
        if (p.state !== "analyzing" && p.state !== "voicing") console.log(p.message);
      },
    },
  );

  const outDir = path.join(repoRoot, "fixtures", "out");
  const audioDir = path.join(outDir, `${name}-audio`);
  await rm(audioDir, { recursive: true, force: true });
  await mkdir(audioDir, { recursive: true });
  const rawFile = path.join(outDir, `${name}.raw.json`);
  const pkgFile = path.join(outDir, `${name}.json`);
  await writeFile(rawFile, JSON.stringify({ promptVersion: VISION_PROMPT_VERSION, model: env.VISION_MODEL, pages: files, segments: raw }, null, 2));
  await writeFile(pkgFile, JSON.stringify(pkg, null, 2));
  const cueByAudio = new Map(pkg.cues.filter((c) => c.audioId !== null).map((c) => [c.audioId!, c]));
  for (const clip of pkg.audio) {
    const cue = cueByAudio.get(clip.id);
    const file = cue ? `${String(cue.order).padStart(3, "0")}-${cue.kind}.mp3` : "recap.mp3";
    await writeFile(path.join(audioDir, file), Buffer.from(clip.dataBase64, "base64"));
  }

  console.log(`\nTranscript (${draft.cues.length} cues, ${segmentCount} segments):`);
  for (const line of transcriptLines(lines, draft, cast)) console.log(line);
  console.log(`\nNew characters (${draft.newCharacters.length}):`);
  for (const c of draft.newCharacters) console.log(`${c.id} | ${c.name} | ${c.voiceSlot} -> ${c.profileId} | ${c.description}`);
  console.log(`\nRegions (${draft.regions.length}):`);
  for (const r of draft.regions) {
    console.log(`p${r.start.pageIndex}@${r.start.y.toFixed(2)} -> p${r.end.pageIndex}@${r.end.y.toFixed(2)} ${r.mood} ${r.intensity}`);
  }
  console.log(`\nRecap: ${draft.recap.text}`);
  const voiced = pkg.cues.filter((c) => c.audioId !== null).length;
  const totalMs = pkg.audio.reduce((sum, a) => sum + a.durationMs, 0);
  console.log(`\nAudio: ${pkg.audio.length} clips = ${voiced} voiced cues + 1 recap, ${(totalMs / 1000).toFixed(1)} s in total`);
  console.log(`wrote ${path.relative(repoRoot, rawFile)}, ${path.relative(repoRoot, pkgFile)} and ${path.relative(repoRoot, audioDir)}${path.sep} (the package validates against ChapterPackageSchema)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
