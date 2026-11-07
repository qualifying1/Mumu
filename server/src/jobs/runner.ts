import type { ChapterPackage, JobMeta } from "@mumu/shared";
import type { ChapterProgress } from "../pipeline/chapter.js";
import type { PageInput } from "../pipeline/slice.js";
import { progressFraction } from "./progress.js";
import type { JobStore } from "./store.js";

/** Everything the pipeline needs for one chapter. The real implementation wraps `buildChapter`. */
export type RunChapter = (
  input: { seriesId: string; chapterId: string; pages: PageInput[]; cast: JobMeta["cast"]; profiles: JobMeta["profiles"] },
  onProgress: (p: ChapterProgress) => void,
) => Promise<ChapterPackage>;

/**
 * Run a job to completion in the background. The returned promise never rejects: a failure is
 * recorded on the job (state failed + error text) and logged, so the client sees it when it polls.
 */
export function startJob(
  store: JobStore,
  jobId: string,
  run: RunChapter,
  meta: JobMeta,
  pages: PageInput[],
  log: (line: string) => void = console.log,
): Promise<void> {
  const label = `job ${jobId} (${meta.chapterId}, ${pages.length} pages)`;
  log(`${label}: started`);
  return run({ seriesId: meta.seriesId, chapterId: meta.chapterId, pages, cast: meta.cast, profiles: meta.profiles }, (p) => {
    if (p.state === "done" || p.state === "failed") return;
    store.update(jobId, p.state, progressFraction(p), p.message);
  }).then(
    (pkg) => {
      store.complete(jobId, pkg);
      log(`${label}: done (${pkg.cues.length} cues, ${pkg.audio.length} clips)`);
    },
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      store.fail(jobId, message);
      log(`${label}: failed: ${message}`);
    },
  );
}
