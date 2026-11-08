import { ApiError } from "@google/genai";
import { describe, expect, it } from "vitest";
import { MAX_SERVER_RETRY_DELAY_MS, serverRetryDelayMs, withBackoff } from "./retry.js";

/** The message Gemini puts in a free-tier 429 (shape copied from a real response, trimmed). */
const quotaMessage = (retry: string) =>
  JSON.stringify({
    error: {
      code: 429,
      message: `You exceeded your current quota. Please retry in ${retry}.`,
      status: "RESOURCE_EXHAUSTED",
      // Real responses carry the same delay here as in the sentence above (whole seconds).
      details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: `${Math.floor(parseFloat(retry))}s` }],
    },
  });

const rateLimited = (retry = "38.759392651s") => new ApiError({ message: quotaMessage(retry), status: 429 });

describe("serverRetryDelayMs", () => {
  it("reads the RetryInfo delay", () => {
    expect(serverRetryDelayMs(rateLimited())).toBe(38_000);
  });
  it("falls back to the 'retry in Ns' sentence, rounding up", () => {
    const err = new ApiError({ message: "Quota exceeded. Please retry in 12.2s.", status: 429 });
    expect(serverRetryDelayMs(err)).toBe(12_200);
  });
  it("is null when the server gave no hint", () => {
    expect(serverRetryDelayMs(new ApiError({ message: "overloaded", status: 503 }))).toBeNull();
  });
});

describe("withBackoff honors the server's retry delay on 429", () => {
  it("waits the hinted delay (plus a margin), not 1 s", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const value = await withBackoff(
      async () => {
        if (++calls < 2) throw rateLimited();
        return "ok";
      },
      { sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(value).toBe("ok");
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeGreaterThanOrEqual(38_000);
    expect(sleeps[0]).toBeLessThan(40_000);
  });

  it("never waits less than the normal backoff step", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    await withBackoff(
      async () => {
        if (++calls < 4) throw new ApiError({ message: "Please retry in 0.1s", status: 429 });
        return "ok";
      },
      { sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(sleeps).toEqual([1000, 2000, 4000]);
  });

  it("fails right away, with the server's text, when the hint is longer than a job should wait (daily quota)", async () => {
    const sleeps: number[] = [];
    const hint = `${Math.ceil(MAX_SERVER_RETRY_DELAY_MS / 1000) + 600}s`;
    await expect(
      withBackoff(
        async () => {
          throw rateLimited(hint);
        },
        { sleep: async (ms) => void sleeps.push(ms) },
      ),
    ).rejects.toThrow(/exceeded your current quota/);
    expect(sleeps).toEqual([]);
  });

  it("still gives up after three retries", async () => {
    let calls = 0;
    await expect(
      withBackoff(
        async () => {
          calls++;
          throw rateLimited("1s");
        },
        { sleep: async () => {} },
      ),
    ).rejects.toThrow();
    expect(calls).toBe(4);
  });
});
