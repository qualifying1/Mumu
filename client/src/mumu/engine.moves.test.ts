// Mumu never teleports. Every change of position is a walk, a climb, a jump, a fall, a ride along a moving floor,
// or the glide to the pointer while held. These tests pin that down, including a randomized run that switches
// screens, rings the alarm, and picks Mumu up at random, and caps how far one frame may move it.
import { describe, expect, it } from "vitest";
import {
  CLIMB_SIDESTEP_PX_S,
  HANG_PULL_PX_S,
  HOLD_FOLLOW_PER_S,
  JUMP_MAX_S,
  JUMP_MIN_S,
  RIDE_PX,
  RIDE_SPEED_PX_S,
} from "./constants.ts";
import { createMumuState, step, type EngineInput, type MumuState, type Rng } from "./engine.ts";
import { HELD_REACH } from "./sprites.ts";
import type { MumuAction } from "./gesture.ts";
import type { Playfield, World } from "./layout.ts";

const FRAME = 1 / 60;
const SIZE = 64; // two sprite scale x2
const bounds = { left: 0, right: 390, top: 0, bottom: 800 };

interface Screen {
  name: string;
  world: World;
  field: Playfield;
  parkAt: number | null;
  calm: boolean;
}

// The three places Mumu lives: Home (desk + shelf plank), the other tabs (just above the nav), the reader (screen bottom, corner).
const home: Screen = {
  name: "home",
  world: { minX: 32, maxX: 358, floorY: 500 },
  field: { size: SIZE, bounds, ledges: [{ left: 0, right: 390, top: 200, bottom: 220 }] },
  parkAt: null,
  calm: false,
};
const other: Screen = { name: "other", world: { minX: 32, maxX: 358, floorY: 740 }, field: { size: SIZE, bounds, ledges: [] }, parkAt: null, calm: true };
const reader: Screen = { name: "reader", world: { minX: 32, maxX: 350, floorY: 800 }, field: { size: SIZE, bounds, ledges: [] }, parkAt: 350, calm: false };
const screens = [home, other, reader];

function inputFor(screen: Screen, extra: Partial<EngineInput> = {}): EngineInput {
  return { world: screen.world, field: screen.field, calm: screen.calm, reducedMotion: false, interacted: false, parkAt: screen.parkAt, ...extra };
}

function mulberry(seed: number): Rng {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mumu settled on `screen`'s floor (it appears there when the app opens). */
function settledOn(screen: Screen, rng: Rng = mulberry(1)): MumuState {
  let s = createMumuState(screen.world, rng);
  if (screen.parkAt != null) s = { ...s, x: screen.parkAt };
  return s;
}

const MAX_FRAME_MOVE_PX = 45;

/** Step until `seconds` have passed, asserting no frame moves Mumu further than MAX_FRAME_MOVE_PX. */
function runOn(s: MumuState, screen: Screen, seconds: number, rng: Rng, extra: Partial<EngineInput> = {}): MumuState {
  for (let i = 0; i < Math.round(seconds / FRAME); i++) {
    const next = step(s, inputFor(screen, extra), FRAME, rng);
    expect(Math.hypot(next.x - s.x, next.y - s.y)).toBeLessThanOrEqual(MAX_FRAME_MOVE_PX);
    s = next;
  }
  return s;
}

describe("the floor moves under Mumu", () => {
  it("a lower floor (Home desk -> reader): Mumu falls with gravity, never snaps down", () => {
    const rng = mulberry(2);
    let s = runOn(settledOn(home), home, 1, rng, { calm: true }); // calm: stays put
    const y0 = s.y;
    expect(y0).toBe(500);
    let next = step(s, inputFor({ ...reader, parkAt: null }), FRAME, rng);
    expect(next.mode).toBe("falling");
    expect(next.y).toBe(y0); // the first falling frame hasn't moved far
    let prevVy = 0;
    for (let i = 0; i < 120 && next.mode === "falling"; i++) {
      expect(next.vy).toBeGreaterThanOrEqual(prevVy);
      prevVy = next.vy;
      s = next;
      next = step(s, inputFor({ ...reader, parkAt: null }), FRAME, rng);
      expect(next.y - s.y).toBeLessThanOrEqual(MAX_FRAME_MOVE_PX);
    }
    expect(next.mode).toBe("ground");
    expect(next.y).toBe(800);
  });

  it("a higher floor (reader -> Home desk): Mumu jumps up onto it in an arc, landing exactly on the desk", () => {
    const rng = mulberry(3);
    const s0 = settledOn({ ...reader, parkAt: null });
    expect(s0.y).toBe(800);
    let s = step(s0, inputFor(home), FRAME, rng);
    expect(s.mode).toBe("jumping");
    expect(s.jump!.dur).toBeGreaterThanOrEqual(JUMP_MIN_S);
    expect(s.jump!.dur).toBeLessThanOrEqual(JUMP_MAX_S);
    const { fromX, fromY, toX, toY } = s.jump!;
    let peakAbove = 0;
    for (let i = 0; i < 90 && s.mode === "jumping"; i++) {
      const prev = s;
      s = step(s, inputFor(home), FRAME, rng);
      expect(Math.hypot(s.x - prev.x, s.y - prev.y)).toBeLessThanOrEqual(MAX_FRAME_MOVE_PX);
      // height above the straight line from take-off to landing
      const u = (s.x - fromX) / (toX - fromX || 1);
      const lineY = fromY + (toY - fromY) * (toX === fromX ? s.jump ? s.jump.t / s.jump.dur : 1 : u);
      peakAbove = Math.max(peakAbove, lineY - s.y);
    }
    expect(peakAbove).toBeGreaterThan(20); // it really arcs
    expect(s.mode).toBe("ground");
    expect(s.y).toBe(500);
    expect(s.x).toBe(toX);
  });

  it("a small shift of the floor (page scroll) is followed smoothly", () => {
    const rng = mulberry(4);
    let s = settledOn(home);
    const shifted: Screen = { ...home, world: { ...home.world, floorY: 500 + RIDE_PX - 2 } };
    for (let i = 0; i < 30; i++) {
      const next = step(s, inputFor({ ...shifted, calm: true }), FRAME, rng);
      expect(next.mode).toBe("ground");
      expect(next.y - s.y).toBeLessThanOrEqual(RIDE_SPEED_PX_S * FRAME + 1e-9);
      s = next;
    }
    expect(s.y).toBe(500 + RIDE_PX - 2);
  });

  it("every screen to every other: Mumu is back on the new floor, in range, and at the corner in the reader, on its own two feet", () => {
    for (const a of screens) {
      for (const b of screens) {
        if (a === b) continue;
        const rng = mulberry(7);
        let s = runOn(settledOn(a, rng), a, 6, rng);
        s = runOn(s, b, 40, rng);
        expect(s.mode, `${a.name} -> ${b.name}`).toBe("ground");
        expect(s.y, `${a.name} -> ${b.name}`).toBe(b.world.floorY);
        expect(s.x).toBeGreaterThanOrEqual(b.world.minX - 0.5);
        expect(s.x).toBeLessThanOrEqual(b.world.maxX + 0.5);
        if (b.parkAt != null) expect(s.x).toBe(b.parkAt);
      }
    }
  });
});

describe("being picked up and put down", () => {
  const act = (s: MumuState, actions: MumuAction[]) => step(s, inputFor(home, { actions, calm: true }), FRAME, mulberry(1));

  it("a grab does not make Mumu jump to the pointer: it glides there", () => {
    const s0 = settledOn(home);
    // The pointer is a sprite away from where Mumu would hang by the scruff.
    const target = { x: s0.x + 90, y: s0.y - 120 };
    const first = act(s0, [{ type: "grab", x: target.x, y: target.y }]);
    const dist = Math.hypot(target.x - s0.x, target.y + SIZE * HELD_REACH - s0.y);
    const moved = Math.hypot(first.x - s0.x, first.y - s0.y);
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(dist * 0.6);
    let s = first;
    for (let i = 0; i < 60; i++) s = act(s, []);
    expect(s.x).toBe(target.x);
    expect(s.y).toBe(target.y + SIZE * HELD_REACH);
  });

  it("the glide closes the gap at the documented rate", () => {
    const s0 = settledOn(home);
    const first = act(s0, [{ type: "grab", x: s0.x + 100, y: s0.y - SIZE }]); // exactly 100 px right of the scruff spot
    expect(first.x - s0.x).toBeCloseTo(100 * Math.min(1, HOLD_FOLLOW_PER_S * FRAME), 5);
  });

  it("released just under the plank, Mumu is pulled up onto it, not snapped", () => {
    const rng = mulberry(5);
    const plank = home.field.ledges[0]!;
    // Hold it 20 px below the plank's underside, settled.
    let s = step(settledOn(home), inputFor(home, { calm: true, actions: [{ type: "grab", x: 200, y: plank.bottom + 20 }] }), FRAME, rng);
    for (let i = 0; i < 60; i++) s = step(s, inputFor(home, { calm: true }), FRAME, rng);
    const before = s;
    s = step(before, inputFor(home, { calm: true, actions: [{ type: "release" }] }), FRAME, rng);
    expect(s.mode).toBe("hanging");
    expect(before.y - s.y).toBeLessThanOrEqual(HANG_PULL_PX_S * FRAME + 1e-9);
    expect(s.y).toBeGreaterThan(plank.bottom + SIZE); // not at the final spot yet
  });

  it("released near a side edge, Mumu slides over to the wall while it climbs, not snapped", () => {
    const rng = mulberry(6);
    let s = step(settledOn(home), inputFor(home, { calm: true, actions: [{ type: "grab", x: 30, y: 400 }] }), FRAME, rng);
    for (let i = 0; i < 60; i++) s = step(s, inputFor(home, { calm: true }), FRAME, rng);
    // hold at x=30 clamps to 32; move the pointer's target away so it is 16 px from the wall edge, then release
    s = step(s, inputFor(home, { calm: true, actions: [{ type: "move", x: 48, y: 400 }] }), FRAME, rng);
    for (let i = 0; i < 60; i++) s = step(s, inputFor(home, { calm: true }), FRAME, rng);
    const before = s;
    s = step(before, inputFor(home, { calm: true, actions: [{ type: "release" }] }), FRAME, rng);
    expect(s.mode).toBe("climbing");
    expect(Math.abs(s.x - before.x)).toBeLessThanOrEqual(CLIMB_SIDESTEP_PX_S * FRAME + 1e-9);
    expect(s.x).toBeGreaterThan(32);
    for (let i = 0; i < 20; i++) s = step(s, inputFor(home, { calm: true }), FRAME, rng);
    expect(s.x).toBe(32);
  });
});

describe("random life", () => {
  it("over 20 minutes of switching screens, ringing the alarm, picking up, tapping and petting, no frame moves Mumu more than a fall's worth", () => {
    for (const seed of [11, 12, 13]) {
      const driver = mulberry(seed * 100);
      const rng = mulberry(seed);
      let screen = home;
      let s = settledOn(screen, rng);
      let alarm = false;
      let drag = 0; // frames of drag left
      let ptr = { x: 0, y: 0 };
      let maxMove = 0;
      for (let i = 0; i < 60 * 60 * 20; i++) {
        if (driver() < 1 / 900) screen = screens[Math.floor(driver() * screens.length)]!;
        if (driver() < 1 / 1500) alarm = !alarm;
        const actions: MumuAction[] = [];
        if (drag === 0 && driver() < 1 / 2000) {
          // pick up where the sprite is, then wander the pointer at <= 20 px a frame for up to a second
          ptr = { x: s.x, y: s.y - SIZE * HELD_REACH };
          actions.push({ type: "grab", x: ptr.x, y: ptr.y });
          drag = 20 + Math.floor(driver() * 40);
        } else if (drag > 0) {
          ptr = { x: ptr.x + (driver() - 0.5) * 40, y: ptr.y + (driver() - 0.5) * 40 };
          actions.push({ type: "move", x: ptr.x, y: ptr.y });
          if (--drag === 0) actions.push({ type: "release" });
        } else if (driver() < 1 / 400) {
          actions.push({ type: driver() < 0.5 ? "tap" : "stroke" });
        }
        const next = step(s, inputFor(screen, { alarm: alarm && screen === reader, actions }), FRAME, rng);
        const moved = Math.hypot(next.x - s.x, next.y - s.y);
        maxMove = Math.max(maxMove, moved);
        expect(moved, `seed ${seed} frame ${i} ${s.mode}->${next.mode}`).toBeLessThanOrEqual(MAX_FRAME_MOVE_PX);
        s = next;
      }
      expect(maxMove).toBeGreaterThan(0);
    }
  }, 60_000); // 3 x 72k frames: slow when the whole suite runs in parallel
});
