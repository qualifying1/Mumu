import { describe, expect, it } from "vitest";
import { RECAP_SILENT_MAX_S, RECAP_SILENT_MIN_S } from "./constants.ts";
import { recapVolume, silentRecapSeconds } from "./recap.ts";

const on = { on: true, volume: 1 };

describe("recapVolume", () => {
  it("multiplies the master and voices volumes", () => {
    expect(recapVolume({ master: { on: true, volume: 0.5 }, voices: { on: true, volume: 0.5 } })).toBeCloseTo(0.25);
  });
  it("is silent when master or voices is off", () => {
    expect(recapVolume({ master: { on: false, volume: 1 }, voices: on })).toBe(0);
    expect(recapVolume({ master: on, voices: { on: false, volume: 1 } })).toBe(0);
  });
  it("clamps out-of-range volumes", () => {
    expect(recapVolume({ master: { on: true, volume: 3 }, voices: { on: true, volume: -1 } })).toBe(0);
    expect(recapVolume({ master: { on: true, volume: 3 }, voices: on })).toBe(1);
  });
});

describe("silentRecapSeconds", () => {
  it("is long enough to read, within a minimum and a maximum", () => {
    expect(silentRecapSeconds("Short.")).toBe(RECAP_SILENT_MIN_S);
    expect(silentRecapSeconds("x".repeat(100000))).toBe(RECAP_SILENT_MAX_S);
    const mid = silentRecapSeconds("x".repeat(150));
    expect(mid).toBeGreaterThan(RECAP_SILENT_MIN_S);
    expect(mid).toBeLessThan(RECAP_SILENT_MAX_S);
  });
});
