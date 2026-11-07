import { describe, expect, it } from "vitest";
import { notifyActivity, onBreakRequested, requestBreak, setMood, setScreen, subscribe, type BridgeEvent } from "./bridge.ts";

describe("mumu bridge", () => {
  it("delivers B's calls to subscribers in order, and stops after unsubscribe", () => {
    const seen: BridgeEvent[] = [];
    const off = subscribe((e) => seen.push(e));
    setScreen("reader");
    setMood("tense");
    notifyActivity();
    setMood(null);
    off();
    setScreen("home");
    expect(seen).toEqual([
      { type: "screen", screen: "reader" },
      { type: "mood", mood: "tense" },
      { type: "activity" },
      { type: "mood", mood: null },
    ]);
  });

  it("routes break requests to registered callbacks until unsubscribed", () => {
    let calls = 0;
    const off = onBreakRequested(() => calls++);
    requestBreak();
    off();
    requestBreak();
    expect(calls).toBe(1);
  });
});
