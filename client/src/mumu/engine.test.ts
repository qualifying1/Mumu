import { describe, expect, it } from "vitest";
import { IDLE_MAX_S, IDLE_MIN_S, WALK_MIN_DISTANCE_PX, WALK_SPEED_PX_S, YARN_AFTER_IDLE_S } from "./constants.ts";
import { createMumuState, forceAnim, pickIdleChoice, step, type EngineInput, type MumuState, type Rng } from "./engine.ts";
import type { Playfield, World } from "./layout.ts";

const world: World = { minX: 100, maxX: 500, floorY: 600 };
// One plank, but the walkable range (100..500) is far from the screen edges, so idle life never climbs here.
const field: Playfield = { size: 64, bounds: { left: 0, right: 600, top: 0, bottom: 700 }, ledges: [{ left: 0, right: 600, top: 200, bottom: 220 }] };
const input: EngineInput = { world, field, calm: false, reducedMotion: false, interacted: false };

/** Deterministic rng that replays a list of values, then repeats the last. */
function seq(...values: number[]): Rng {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
}

/** A mulberry32 PRNG for distribution checks. */
function mulberry(seed: number): Rng {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function counts(opts: { calm: boolean; reducedMotion: boolean; idleFor: number }, n = 20000) {
  const rng = mulberry(1);
  const out: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const c = pickIdleChoice(rng, opts);
    out[c] = (out[c] ?? 0) + 1;
  }
  return out;
}

describe("pickIdleChoice", () => {
  it("never picks yarn before 20 s idle, and follows 30/20/20/15 for the rest", () => {
    const c = counts({ calm: false, reducedMotion: false, idleFor: YARN_AFTER_IDLE_S - 0.1 });
    expect(c.yarn).toBeUndefined();
    // weights 30/20/20/15 of 85
    expect(c.walk! / 20000).toBeCloseTo(30 / 85, 1);
    expect(c.sit! / 20000).toBeCloseTo(20 / 85, 1);
    expect(c.tailwag! / 20000).toBeCloseTo(15 / 85, 1);
  });

  it("includes yarn at 15% once 20 s idle", () => {
    const c = counts({ calm: false, reducedMotion: false, idleFor: YARN_AFTER_IDLE_S });
    expect(c.yarn! / 20000).toBeCloseTo(0.15, 1);
    expect(c.walk! / 20000).toBeCloseTo(0.3, 1);
  });

  it("calm mode offers only walk, sit and loaf, even when idle for a long time", () => {
    const c = counts({ calm: true, reducedMotion: false, idleFor: 999 });
    expect(Object.keys(c).sort()).toEqual(["loaf", "sit", "walk"]);
  });

  it("reduced motion offers only sit and loaf", () => {
    const c = counts({ calm: false, reducedMotion: true, idleFor: 999 });
    expect(Object.keys(c).sort()).toEqual(["loaf", "sit"]);
  });

  it("survives rng() returning exactly 1", () => {
    expect(pickIdleChoice(() => 1, { calm: false, reducedMotion: false, idleFor: 0 })).toBe("tailwag");
  });
});

describe("createMumuState", () => {
  it("starts sitting mid-floor with a first choice in 4..10 s", () => {
    const s = createMumuState(world, seq(0));
    expect(s.anim).toBe("sit");
    expect(s.x).toBe(300);
    expect(s.nextChoiceIn).toBe(IDLE_MIN_S);
    expect(createMumuState(world, seq(0.999999)).nextChoiceIn).toBeLessThanOrEqual(IDLE_MAX_S);
  });
});

describe("step: idle life", () => {
  it("keeps the animation until the timer expires, then switches", () => {
    let s = createMumuState(world, seq(0)); // next choice in 4 s
    s = step(s, input, 3.9, seq(0.5));
    expect(s.anim).toBe("sit");
    // rng order: next-interval roll, then the choice roll. 0.7 * 85 = 59.5 -> past walk(30) and sit(20), inside loaf(20)
    s = step(s, input, 0.2, seq(0.5, 0.7));
    expect(s.anim).toBe("loaf");
    expect(s.animTime).toBe(0);
  });

  it("does not restart the animation when the choice repeats the current one", () => {
    const s: MumuState = { ...createMumuState(world, seq(0)), anim: "sit", animTime: 2, nextChoiceIn: 0.1 };
    // 0.4 * 85 = 34 -> past walk(30), inside sit(20)
    const next = step(s, input, 0.2, seq(0.5, 0.4));
    expect(next.anim).toBe("sit");
    expect(next.animTime).toBeCloseTo(2.2);
  });

  it("resets the idle clock on interaction and counts it otherwise", () => {
    let s = createMumuState(world, seq(0.5));
    s = step(s, input, 5, seq(0.9));
    expect(s.idleFor).toBe(5);
    s = step(s, { ...input, interacted: true }, 1, seq(0.9));
    expect(s.idleFor).toBe(0);
  });
});

describe("step: walking", () => {
  it("walks toward the target at WALK_SPEED_PX_S, facing the direction of travel", () => {
    let s: MumuState = { ...createMumuState(world, seq(0)), anim: "walk", walkTargetX: 400, x: 300, facing: 1 };
    s = step(s, input, 1, seq(0.5));
    expect(s.x).toBeCloseTo(300 + WALK_SPEED_PX_S);
    expect(s.facing).toBe(1);

    let left: MumuState = { ...createMumuState(world, seq(0)), anim: "walk", walkTargetX: 150, x: 300, facing: 1 };
    left = step(left, input, 1, seq(0.5));
    expect(left.x).toBeCloseTo(300 - WALK_SPEED_PX_S);
    expect(left.facing).toBe(-1);
  });

  it("arrives exactly on the target, sits, and schedules the next choice", () => {
    let s: MumuState = { ...createMumuState(world, seq(0)), anim: "walk", walkTargetX: 310, x: 300 };
    s = step(s, input, 1, seq(0));
    expect(s.x).toBe(310);
    expect(s.walkTargetX).toBeNull();
    expect(s.anim).toBe("sit");
    expect(s.nextChoiceIn).toBe(IDLE_MIN_S);
  });

  it("never leaves the floor, even if the world shrinks around it", () => {
    let s: MumuState = { ...createMumuState(world, seq(0)), x: 480, walkTargetX: 490, anim: "walk" };
    s = step(s, { ...input, world: { ...world, maxX: 200 } }, 0.1, seq(0));
    expect(s.x).toBeLessThanOrEqual(200);
  });

  it("starts a walk of at least WALK_MIN_DISTANCE_PX that stays inside the floor", () => {
    for (const r of [0, 0.3, 0.7, 0.999]) {
      const s = forceAnim(createMumuState(world, seq(0)), "walk", world, seq(r, 0.5, r));
      expect(s.anim).toBe("walk");
      expect(Math.abs(s.walkTargetX! - s.x)).toBeGreaterThanOrEqual(WALK_MIN_DISTANCE_PX);
      expect(s.walkTargetX!).toBeGreaterThanOrEqual(world.minX);
      expect(s.walkTargetX!).toBeLessThanOrEqual(world.maxX);
    }
  });

  it("sits instead of walking when the floor has no room", () => {
    const tiny: World = { minX: 300, maxX: 330, floorY: 600 };
    const s = forceAnim({ ...createMumuState(tiny, seq(0)), x: 315 }, "walk", tiny, seq(0.5));
    expect(s.anim).toBe("sit");
    expect(s.walkTargetX).toBeNull();
  });
});

describe("step: reduced motion", () => {
  it("stops a walk in place and never starts one", () => {
    const walking: MumuState = { ...createMumuState(world, seq(0)), anim: "walk", walkTargetX: 450, x: 300 };
    const stopped = step(walking, { ...input, reducedMotion: true }, 0.5, seq(0));
    expect(stopped.anim).toBe("sit");
    expect(stopped.x).toBe(300);
    expect(stopped.walkTargetX).toBeNull();

    const rng = mulberry(7);
    let s = createMumuState(world, rng);
    for (let i = 0; i < 2000; i++) {
      s = step(s, { ...input, reducedMotion: true }, 0.5, rng);
      expect(["sit", "loaf"]).toContain(s.anim);
    }
  });
});

describe("step: reader parking", () => {
  it("snaps to the park x, cancels any walk, and never wanders", () => {
    const walking: MumuState = { ...createMumuState(world, seq(0)), anim: "walk", walkTargetX: 200, x: 300 };
    let s = step(walking, { ...input, parkAt: 480 }, 0.1, seq(0));
    expect(s.x).toBe(480);
    expect(s.walkTargetX).toBeNull();
    expect(s.anim).toBe("sit");
    expect(s.facing).toBe(-1);

    const rng = mulberry(3);
    for (let i = 0; i < 2000; i++) {
      s = step(s, { ...input, parkAt: 480 }, 0.5, rng);
      expect(s.x).toBe(480);
      expect(["sit", "loaf"]).toContain(s.anim);
    }
  });

  it("walks again once parking ends", () => {
    const rng = mulberry(11);
    let s = createMumuState(world, rng);
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      s = step(s, input, 0.5, rng);
      seen.add(s.anim);
    }
    expect(seen.has("walk")).toBe(true);
  });
});

describe("forceAnim", () => {
  it("switches animation, cancels any walk and holds it for a normal interval", () => {
    const walking: MumuState = { ...createMumuState(world, seq(0)), anim: "walk", walkTargetX: 450 };
    const s = forceAnim(walking, "yarn", world, seq(0));
    expect(s.anim).toBe("yarn");
    expect(s.walkTargetX).toBeNull();
    expect(s.nextChoiceIn).toBe(IDLE_MIN_S);
  });
});

describe("long run", () => {
  it("stays on the floor and eventually shows every idle animation (yarn after 20 s)", () => {
    const rng = mulberry(42);
    let s = createMumuState(world, rng);
    const seen = new Set<string>();
    for (let i = 0; i < 20000; i++) {
      s = step(s, input, 1 / 30, rng);
      seen.add(s.anim);
      expect(s.x).toBeGreaterThanOrEqual(world.minX);
      expect(s.x).toBeLessThanOrEqual(world.maxX);
    }
    expect([...seen].sort()).toEqual(["loaf", "sit", "tailwag", "walk", "yarn"]);
  });
});
