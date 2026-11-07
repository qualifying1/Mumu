import { describe, expect, it } from "vitest";
import { FAST_ANIM_RATE, MOOD_DEBOUNCE_S, MOOD_EMOTE_LIFE_S, MOOD_REACTION_S } from "./constants.ts";
import { createMumuState, step, type EngineInput, type MumuState, type Rng } from "./engine.ts";
import type { Playfield, World } from "./layout.ts";
import { MOOD_REACTIONS } from "./mood.ts";
import { MOODS, type Mood } from "@mumu/shared";

const world: World = { minX: 100, maxX: 500, floorY: 600 };
const field: Playfield = { size: 64, bounds: { left: 0, right: 600, top: 0, bottom: 700 }, ledges: [] };
const rng: Rng = () => 0.5;
// The reader: parked in the right corner.
const reader: EngineInput = { world, field, calm: false, reducedMotion: false, interacted: false, parkAt: world.maxX };

function parked(): MumuState {
  return { ...createMumuState(world, rng), x: world.maxX, nextChoiceIn: 999 };
}

function run(s: MumuState, input: EngineInput, seconds: number, dt = 0.05): MumuState {
  for (let t = 0; t < seconds - 1e-9; t += dt) s = step(s, input, dt, rng);
  return s;
}

describe("scene reactions in the reader", () => {
  it.each(MOODS)("%s: shows its pose and emote (F8 table)", (mood: Mood) => {
    const r = MOOD_REACTIONS[mood];
    const s = run(parked(), { ...reader, mood }, 0.5);
    expect(s.anim).toBe(r.anim);
    expect(s.emotes.map((e) => e.kind)).toEqual(r.emote ? [r.emote] : []);
  });

  it("floats the scene emote longer than a petting heart", () => {
    const s = run(parked(), { ...reader, mood: "tense" }, 0.1);
    expect(s.emotes[0]!.life).toBe(MOOD_EMOTE_LIFE_S);
    expect(run(s, { ...reader, mood: "tense" }, MOOD_EMOTE_LIFE_S + 0.2).emotes).toEqual([]);
  });

  it("battle wags fast: the animation clock runs faster than real time", () => {
    const battle = run(parked(), { ...reader, mood: "battle" }, 1);
    const climax = run(parked(), { ...reader, mood: "climax" }, 1);
    expect(battle.anim).toBe("tailwag");
    expect(climax.anim).toBe("tailwag");
    expect(battle.animTime).toBeCloseTo(climax.animTime * FAST_ANIM_RATE, 0);
  });

  it("holds the pose, then idle life resumes (sit) when the mood stays", () => {
    const s = run(parked(), { ...reader, mood: "comedic" }, MOOD_REACTION_S - 1);
    expect(s.anim).toBe("yarn");
    const later = run(s, { ...reader, mood: "comedic" }, 2);
    expect(later.reaction).toBeNull();
    expect(later.anim).toBe("sit");
  });

  it("a new mood inside the debounce window waits, then takes over", () => {
    let s = run(parked(), { ...reader, mood: "tense" }, 1);
    expect(s.anim).toBe("sit");
    s = run(s, { ...reader, mood: "comedic" }, 1);
    expect(s.anim).toBe("sit"); // still tense's pose: only ~2 s in
    s = run(s, { ...reader, mood: "comedic" }, MOOD_DEBOUNCE_S);
    expect(s.anim).toBe("yarn");
  });

  it("leaving the reader (mood null) ends the reaction", () => {
    let s = run(parked(), { ...reader, mood: "comedic" }, 1);
    expect(s.anim).toBe("yarn");
    s = run(s, { ...reader, mood: null }, 0.2);
    expect(s.reaction).toBeNull();
  });

  it("reduced motion keeps to sit and loaf, but the emote still shows", () => {
    const s = run(parked(), { ...reader, reducedMotion: true, mood: "climax" }, 0.5);
    expect(s.anim).toBe("sit");
    expect(s.emotes.map((e) => e.kind)).toEqual(["sparkle"]);
    expect(run(parked(), { ...reader, reducedMotion: true, mood: "sad" }, 0.5).anim).toBe("loaf");
  });

  it("does not move Mumu: it stays parked in its corner", () => {
    const s = run(parked(), { ...reader, mood: "battle" }, 3);
    expect(s.x).toBe(world.maxX);
    expect(s.y).toBe(world.floorY);
  });

  it("the break alarm outranks a scene reaction", () => {
    const s = run(parked(), { ...reader, mood: "tense", alarm: true }, 0.5);
    expect(s.reaction).toBeNull();
    expect(s.emotes).toEqual([]);
    expect(s.alarmOn).toBe(true);
  });

  it("picking Mumu up cancels the reaction", () => {
    let s = run(parked(), { ...reader, mood: "comedic" }, 0.5);
    s = step(s, { ...reader, mood: "comedic", actions: [{ type: "grab", x: world.maxX, y: 560 }] }, 0.05, rng);
    expect(s.mode).toBe("held");
    expect(s.reaction).toBeNull();
  });

  it("is not triggered without a mood (Home, other tabs)", () => {
    const s = run(parked(), { ...reader, mood: null }, 2);
    expect(s.reaction).toBeNull();
    expect(s.emotes).toEqual([]);
  });
});

describe("recap talking pose", () => {
  it("holds the meow pose while speaking, then goes back to sitting", () => {
    let s = run(parked(), { ...reader, speaking: true }, 0.5);
    expect(s.anim).toBe("meow");
    s = run(s, { ...reader, speaking: false }, 0.2);
    expect(s.anim).not.toBe("meow");
  });
  it("outranks a scene reaction while speaking", () => {
    const s = run(parked(), { ...reader, mood: "comedic", speaking: true }, 0.5);
    expect(s.anim).toBe("meow");
  });
});

describe("the reader corner", () => {
  it("sits in the left corner facing right (into the page), the right corner facing left", () => {
    const left = run({ ...parked(), x: world.minX }, { ...reader, parkAt: world.minX }, 0.2);
    expect(left.x).toBe(world.minX);
    expect(left.facing).toBe(1);
    expect(run(parked(), reader, 0.2).facing).toBe(-1);
  });

  it("walks to a newly chosen corner on foot, never teleporting", () => {
    let s = run(parked(), reader, 0.2);
    const input = { ...reader, parkAt: world.minX };
    const xs: number[] = [];
    for (let i = 0; i < 400; i++) {
      s = step(s, input, 0.05, rng);
      xs.push(s.x);
    }
    expect(s.x).toBe(world.minX);
    const biggestJump = Math.max(...xs.slice(1).map((x, i) => Math.abs(x - xs[i]!)));
    expect(biggestJump).toBeLessThan(10);
  });
});
