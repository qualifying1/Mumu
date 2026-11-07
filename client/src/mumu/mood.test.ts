import { MOODS } from "@mumu/shared";
import { describe, expect, it } from "vitest";
import { MOOD_DEBOUNCE_S } from "./constants.ts";
import { createMoodWatch, MOOD_REACTIONS, stepMoodWatch, type MoodWatch } from "./mood.ts";

/** Run the watch through [mood, dt] steps and return what fired, with the final watch. */
function run(steps: Array<[Parameters<typeof stepMoodWatch>[1], number]>, start: MoodWatch = createMoodWatch()) {
  let watch = start;
  const fired: Array<{ at: number; mood: string | null }> = [];
  let t = 0;
  for (const [mood, dt] of steps) {
    t += dt;
    const r = stepMoodWatch(watch, mood, dt);
    watch = r.watch;
    if (r.fire !== undefined) fired.push({ at: t, mood: r.fire });
  }
  return { fired, watch };
}

describe("MOOD_REACTIONS (F8 table)", () => {
  it("covers every mood", () => {
    expect(Object.keys(MOOD_REACTIONS).sort()).toEqual([...MOODS].sort());
  });
  it("maps each mood to the documented pose and emote", () => {
    const table = Object.fromEntries(MOODS.map((m) => [m, [MOOD_REACTIONS[m].anim, MOOD_REACTIONS[m].emote, MOOD_REACTIONS[m].fast]]));
    expect(table).toEqual({
      calm: ["loaf", null, false],
      tense: ["sit", "exclaim", false],
      mystery: ["sit", "question", false],
      battle: ["tailwag", "exclaim", true],
      climax: ["tailwag", "sparkle", false],
      romance: ["sit", "heart", false],
      sad: ["loaf", "tear", false],
      comedic: ["yarn", null, false],
    });
  });
});

describe("stepMoodWatch", () => {
  it("reacts at once to the first mood", () => {
    expect(run([["tense", 0.016]]).fired).toEqual([{ at: 0.016, mood: "tense" }]);
  });

  it("does not fire again while the mood stays the same", () => {
    expect(run([["tense", 0.1], ["tense", 10], ["tense", 10]]).fired).toHaveLength(1);
  });

  it("makes a second mood wait out the debounce window, then reacts to it once", () => {
    const { fired } = run([["tense", 0.1], ["battle", 1], ["battle", 1], ["battle", 1], ["battle", 1.5]]);
    expect(fired.map((f) => f.mood)).toEqual(["tense", "battle"]);
    expect(fired[1]!.at).toBeGreaterThanOrEqual(0.1 + MOOD_DEBOUNCE_S);
    expect(fired[1]!.at).toBeLessThan(0.1 + MOOD_DEBOUNCE_S + 1.5 + 1e-9);
  });

  it("reacts at once to a change when the window has already passed", () => {
    const { fired } = run([["tense", 0.1], ["tense", MOOD_DEBOUNCE_S + 1], ["sad", 0.016]]);
    expect(fired.map((f) => f.mood)).toEqual(["tense", "sad"]);
  });

  it("ignores a flip that flips back inside the window (a region boundary jitter)", () => {
    const { fired } = run([["tense", 0.1], ["battle", 1], ["tense", 1], ["tense", 10]]);
    expect(fired.map((f) => f.mood)).toEqual(["tense"]);
  });

  it("a quick run through several moods ends on the newest one", () => {
    const { fired } = run([["tense", 0.1], ["battle", 0.5], ["sad", 0.5], ["romance", 0.5], ["romance", MOOD_DEBOUNCE_S]]);
    expect(fired.map((f) => f.mood)).toEqual(["tense", "romance"]);
  });

  it("null stops the reaction once, and re-entering with the same mood reacts again", () => {
    const { fired } = run([["tense", 0.1], [null, 0.1], [null, 0.1], ["tense", MOOD_DEBOUNCE_S], ["tense", 0.1]]);
    expect(fired.map((f) => f.mood)).toEqual(["tense", null, "tense"]);
  });

  it("null with nothing applied fires nothing", () => {
    expect(run([[null, 1], [null, 1]]).fired).toEqual([]);
  });
});
