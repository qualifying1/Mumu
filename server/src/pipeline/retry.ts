import { ApiError } from "@google/genai";

/** Backoff schedule for HTTP 429 / 5xx (server rule: 1 s, 2 s, 4 s, then fail). */
export const BACKOFF_MS = [1000, 2000, 4000] as const;

/**
 * Longest wait we accept when a 429 tells us when to come back. Per-minute limits ask for under a
 * minute; a longer hint means a daily/billing quota, which waiting inside a job cannot fix.
 */
export const MAX_SERVER_RETRY_DELAY_MS = 60_000;
/** Added to the server's hint so we land just after the window reopens, not on its edge. */
const HINT_MARGIN_MS = 500;

/** Only rate limits and server errors are worth retrying; everything else fails immediately. */
export function isRetryableApiError(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 429 || err.status >= 500);
}

/**
 * How long the API says to wait, if it says. Gemini's 429 body carries `"retryDelay": "38s"`
 * (google.rpc.RetryInfo) and the sentence "Please retry in 38.75s". Null when there is no hint.
 */
export function serverRetryDelayMs(err: unknown): number | null {
  const text = err instanceof Error ? err.message : "";
  const match = /"?retryDelay"?\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(text) ?? /retry in (\d+(?:\.\d+)?)s/i.exec(text);
  return match ? Math.ceil(Number(match[1]) * 1000) : null;
}

export type Sleep = (ms: number) => Promise<void>;
export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn`; on a retryable error wait and try again, up to BACKOFF_MS.length retries.
 * A 429 that says when to retry is waited out for that long (never less than the backoff step);
 * a hint over MAX_SERVER_RETRY_DELAY_MS fails at once. The final error is rethrown unchanged so
 * the caller can add stage/segment context.
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
      let delay: number | undefined = BACKOFF_MS[attempt];
      if (delay === undefined || !isRetryableApiError(err)) throw err;
      if ((err as ApiError).status === 429) {
        const hint = serverRetryDelayMs(err);
        if (hint !== null) {
          if (hint > MAX_SERVER_RETRY_DELAY_MS) throw err;
          delay = Math.max(delay, hint + HINT_MARGIN_MS);
        }
      }
      opts.onRetry?.(attempt + 1, delay, err);
      await sleep(delay);
    }
  }
}
