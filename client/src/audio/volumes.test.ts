import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../db/db.ts";
import { DUCK_LEVEL, effectiveVolumes, musicTarget } from "./volumes.ts";

const base = DEFAULT_SETTINGS.audio;

describe("effectiveVolumes", () => {
  it("multiplies master by channel", () => {
    const v = effectiveVolumes({ ...base, master: { on: true, volume: 0.5 }, music: { on: true, volume: 0.6 } });
    expect(v.music).toBeCloseTo(0.3);
    expect(v.voices).toBeCloseTo(0.5);
  });

  it("is 0 for a channel that is off", () => {
    expect(effectiveVolumes({ ...base, sfx: { on: false, volume: 1 } }).sfx).toBe(0);
  });

  it("is 0 everywhere when master is off", () => {
    expect(effectiveVolumes({ ...base, master: { on: false, volume: 1 } })).toEqual({ voices: 0, music: 0, sfx: 0 });
  });

  it("clamps out-of-range volumes", () => {
    expect(effectiveVolumes({ ...base, master: { on: true, volume: 3 }, voices: { on: true, volume: -1 } }).voices).toBe(0);
  });
});

describe("musicTarget", () => {
  it("ducks to 35% while a voice plays", () => {
    const v = { voices: 1, music: 0.6, sfx: 1 };
    expect(musicTarget(v, false)).toBeCloseTo(0.6);
    expect(musicTarget(v, true)).toBeCloseTo(0.6 * DUCK_LEVEL);
    expect(DUCK_LEVEL).toBe(0.35);
  });
});
