// Polls a job until it is done (CONTRACT §4: every 1.5 s). Pure of the DOM and Dexie; the API and clock are injected.
import type { JobStatus } from "@mumu/shared";
import { ApiError } from "../api/client.ts";

export const POLL_INTERVAL_MS = 1500;
/** Consecutive network failures (server unreachable) tolerated before the job is reported as failed. */
export const MAX_NETWORK_ERRORS = 3;

export class JobFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobFailedError";
  }
}

export class JobExpiredError extends Error {
  constructor() {
    super("The server no longer knows this job (it may have restarted or the result expired). Retry to start it again.");
    this.name = "JobExpiredError";
  }
}

export interface PollDeps {
  getStatus(jobId: string, signal?: AbortSignal): Promise<JobStatus>;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  onStatus(status: JobStatus): void;
  signal?: AbortSignal;
}

/** Resolves when the job is `done`. Throws JobFailedError / JobExpiredError, or the underlying error after repeated network failures. */
export async function pollJob(jobId: string, deps: PollDeps): Promise<void> {
  let networkErrors = 0;
  for (;;) {
    deps.signal?.throwIfAborted();
    let status: JobStatus;
    try {
      status = await deps.getStatus(jobId, deps.signal);
      networkErrors = 0;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) throw new JobExpiredError();
      if (e instanceof ApiError && e.status === 0 && ++networkErrors < MAX_NETWORK_ERRORS) {
        console.warn(`[processing] poll ${networkErrors}/${MAX_NETWORK_ERRORS} failed, trying again`, e);
        await deps.sleep(POLL_INTERVAL_MS, deps.signal);
        continue;
      }
      throw e;
    }

    if (status.state === "failed") throw new JobFailedError(status.error ?? status.message);
    deps.onStatus(status);
    if (status.state === "done") return;
    await deps.sleep(POLL_INTERVAL_MS, deps.signal);
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
