import { ApiError } from "@google/genai";

/** Backoff schedule for HTTP 429 / 5xx (server rule: 1 s, 2 s, 4 s, then fail). */
export const BACKOFF_MS = [1000, 2000, 4000] as const;

/** Only rate limits and server errors are worth retrying; everything else fails immediately. */
export function isRetryableApiError(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 429 || err.status >= 500);
}

export type Sleep = (ms: number) => Promise<void>;
export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn`; on a retryable error wait and try again, up to BACKOFF_MS.length retries.
 * The final error is rethrown unchanged so the caller can add stage/segment context.
 */
export async function withBackoff<T>(
  fn: () => Promise<T>,
  opts: { sleep?: Sleep; onRetry?: (attempt: number, delayMs: number, err: unknown) => void } = {},
): Promise<T> {
  const sleep = opts.sleep ?? realSleep;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const delay = BACKOFF_MS[attempt];
      if (delay === undefined || !isRetryableApiError(err)) throw err;
      opts.onRetry?.(attempt + 1, delay, err);
      await sleep(delay);
    }
  }
}
