// Runs one processing job at a time, outside React, so switching tabs never interrupts it (SPEC F2).
// Flow: downscale pages → POST /jobs (with the cast and all profiles) → poll → GET package → storePackage.
// The chapter row's status mirrors the run (processing → ready | failed). A retry is just a new run: nothing was stored.
import { useSyncExternalStore } from "react";
import { getApi, type ApiClient } from "../api/client.ts";
import { db } from "../db/db.ts";
import { storePackage } from "../db/storePackage.ts";
import { downscalePage } from "./downscale.ts";
import { buildJobMeta } from "./jobMeta.ts";
import { pollJob, sleep } from "./poll.ts";
import { isBusy, isStepState, type ProcessView, type StepState } from "./steps.ts";

type Views = ReadonlyMap<string, ProcessView>;

const views = new Map<string, ProcessView>();
let snapshot: Views = new Map();
const listeners = new Set<() => void>();

function setView(chapterId: string, view: ProcessView): void {
  views.set(chapterId, view);
  snapshot = new Map(views);
  for (const l of listeners) l();
}

/** Hide a finished or failed run's panel. A running one cannot be dismissed. */
export function dismissView(chapterId: string): void {
  if (isBusy(views.get(chapterId))) return;
  views.delete(chapterId);
  snapshot = new Map(views);
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Live view of every run started in this session, keyed by chapter id. */
export function useProcessViews(): Views {
  return useSyncExternalStore(subscribe, () => snapshot);
}

export function isAnyBusy(): boolean {
  return [...views.values()].some((v) => isBusy(v));
}

/**
 * Process a chapter. Resolves when the run ends, success or failure; a failure is shown in the chapter's view and
 * stored on the chapter row (and logged), so callers do not need to catch. Only one run at a time: a second chapter
 * of the same series needs the first one's new characters in its cast.
 */
export async function startProcessing(chapterId: string, api: ApiClient = getApi()): Promise<void> {
  if (isAnyBusy()) throw new Error("Mumu is still busy with another chapter. Wait for it to finish first.");

  let lastState: StepState | null = null;
  setView(chapterId, { kind: "preparing", message: "Mumu is opening the chapter…" });
  try {
    const chapter = await db.chapters.get(chapterId);
    if (!chapter) throw new Error(`Chapter ${chapterId} is not in the library.`);
    await db.chapters.update(chapterId, { status: "processing", error: undefined, jobId: undefined });

    const [pageRows, cast, profiles] = await Promise.all([
      db.pages.where("[chapterId+index]").between([chapterId, 0], [chapterId, Infinity]).toArray(),
      db.characters.where("seriesId").equals(chapter.seriesId).toArray(),
      db.profiles.toArray(),
    ]);
    if (pageRows.length === 0) throw new Error("This chapter has no pages stored.");
    const meta = buildJobMeta({ seriesId: chapter.seriesId, chapterId, cast, profiles });

    const uploads: Blob[] = [];
    for (const [i, page] of pageRows.entries()) {
      setView(chapterId, { kind: "preparing", message: `Mumu is shrinking page ${i + 1}/${pageRows.length}…` });
      uploads.push(await downscalePage(page.blob, page.width, page.height));
    }

    setView(chapterId, { kind: "preparing", message: "Mumu is carrying the pages to the server…" });
    const jobId = await api.createJob(uploads, meta);
    await db.chapters.update(chapterId, { jobId });

    await pollJob(jobId, {
      getStatus: (id, signal) => api.getJobStatus(id, signal),
      sleep,
      onStatus: (status) => {
        if (!isStepState(status.state)) return;
        lastState = status.state;
        setView(chapterId, { kind: "running", state: status.state, progress: status.progress, message: status.message });
      },
    });

    setView(chapterId, { kind: "storing" });
    const pkg = await api.getPackage(jobId);
    await storePackage(pkg);
    setView(chapterId, { kind: "done" });
  } catch (e) {
    console.error(`[processing] chapter ${chapterId} failed`, e);
    const error = e instanceof Error ? e.message : String(e);
    setView(chapterId, { kind: "failed", error, atState: lastState });
    try {
      await db.chapters.update(chapterId, { status: "failed", error, jobId: undefined });
    } catch (dbError) {
      console.error(`[processing] could not record the failure on chapter ${chapterId}`, dbError);
    }
  }
}
