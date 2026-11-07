// Fixture CLI: run the pipeline stages on a folder of page images.
//   npm run fixture -- fixtures/ch1
// A1 covers slice + vision and writes the raw per-segment results to fixtures/out/<name>.raw.json.
// Merge, reasoning and the full package land in A2+ (and add the --cast flag).
import dotenv from "dotenv";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DiskCache } from "./pipeline/cache.js";
import { parsePipelineEnv } from "./pipeline/config.js";
import { createGeminiVisionGenerate } from "./pipeline/gemini.js";
import { normalizePage, sliceChapter } from "./pipeline/slice.js";
import { analyzeChapter } from "./pipeline/vision.js";
import { VISION_PROMPT_VERSION } from "./pipeline/visionSchema.js";

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const serverDir = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(serverDir, "..");

function usage(): never {
  throw new Error("usage: npm run fixture -- <folder of page images>   (example: npm run fixture -- fixtures/ch1)");
}

function parseArgs(argv: string[]): { folder: string } {
  const positional: string[] = [];
  for (const arg of argv) {
    if (arg.startsWith("--")) throw new Error(`unknown option ${arg} (--cast arrives with milestone A2)`);
    positional.push(arg);
  }
  if (positional.length !== 1) usage();
  // npm runs workspace scripts from server/, so resolve relative paths against where the user typed the command.
  const base = process.env.INIT_CWD ?? process.cwd();
  return { folder: path.resolve(base, positional[0]!) };
}

async function main() {
  const { folder } = parseArgs(process.argv.slice(2));
  dotenv.config({ path: path.join(serverDir, ".env"), quiet: true });
  const env = parsePipelineEnv(process.env);

  const files = (await readdir(folder)).filter((f) => IMAGE_EXT.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (files.length === 0) throw new Error(`no images (.jpg/.png/.webp) in ${folder}`);

  const name = path.basename(folder);
  console.log(`fixture ${name}: ${files.length} pages, model ${env.VISION_MODEL}, ${VISION_PROMPT_VERSION}, concurrency ${env.VISION_CONCURRENCY}`);

  const pages = [];
  for (const file of files) pages.push({ bytes: await normalizePage(await readFile(path.join(folder, file))) });
  const segments = await sliceChapter(pages);
  console.log(`sliced into ${segments.length} segments`);

  const results = await analyzeChapter(
    segments,
    { model: env.VISION_MODEL, cast: [], cache: new DiskCache(env.CACHE_DIR), generate: createGeminiVisionGenerate(env.GEMINI_API_KEY) },
    env.VISION_CONCURRENCY,
    (done, total) => console.log(`Analyzing segment ${done}/${total}`),
  );

  const itemCount = results.reduce((n, r) => n + r.result.items.length, 0);
  const outDir = path.join(repoRoot, "fixtures", "out");
  await mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `${name}.raw.json`);
  await writeFile(
    outFile,
    JSON.stringify({ promptVersion: VISION_PROMPT_VERSION, model: env.VISION_MODEL, pages: files, segments: results }, null, 2),
  );
  console.log(`wrote ${path.relative(repoRoot, outFile)}: ${results.length} segments, ${itemCount} text items`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
