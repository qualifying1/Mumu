// C2 engine tests: drag, swing, drop, hang, climb, tap, pet.
import { describe, expect, it } from "vitest";
import {
  CLIMB_AFTER_IDLE_S,
  CLIMB_SPEED_AT_X3_PX_S,
  IDLE_WEIGHTS,
  WALK_MIN_DISTANCE_PX,
  EDGE_CATCH_PX,
  GRAVITY_PX_S2,
  HANG_CATCH_PX,
  HANG_MAX_S,
  HANG_MIN_S,
  PET_DURATION_S,
  PET_TAP_WINDOW_S,
  SWING_MAX_DEG,
  TAP_MEOW_S,
} from "./constants.ts";
import { climbSpeed, createMumuState, forceAnim, hangFeetY, pickIdleChoice, startClimbWalk, step, type EngineInput, type MumuState, type Rng } from "./engine.ts";
import type { MumuAction } from "./gesture.ts";
import type { Playfield, World } from "./layout.ts";

// A 600-wide screen with a 64 px sprite and one plank spanning it.
const world: World = { minX: 100, maxX: 500, floorY: 600 };
const field: Playfield = {
  size: 64,
  bounds: { left: 0, right: 600, top: 0, bottom: 700 },
  ledges: [{ left: 0, right: 600, top: 200, bottom: 220 }],
};
const input: EngineInput = { world, field, calm: false, reducedMotion: false, interacted: false };
const ledge = field.ledges[0]!;
const FRAME = 1 / 60;

function seq(...values: number[]): Rng {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
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

/** Step once with the given actions (or none). */
function act(s: MumuState, actions: MumuAction[] = [], extra: Partial<EngineInput> = {}, rng: Rng = seq(0.5)): MumuState {
  return step(s, { ...input, ...extra, actions }, FRAME, rng);
}

/** Step `seconds` of idle frames. */
function run(s: MumuState, seconds: number, extra: Partial<EngineInput> = {}, rng: Rng = seq(0.5)): MumuState {
  for (let i = 0; i < Math.round(seconds / FRAME); i++) s = act(s, [], extra, rng);
  return s;
}

/** Let a glide (held -> pointer, hang pull-up, climb side-step) finish. */
function settle(s: MumuState, frames = 60, extra: Partial<EngineInput> = {}): MumuState {
  for (let i = 0; i < frames; i++) s = act(s, [], extra);
  return s;
}

/** Pick Mumu up with the pointer at (x, y) (the pointer is the top centre of the sprite) and let it glide there. */
function held(x = 300, y = 400): MumuState {
  return settle(act(createMumuState(world, seq(0)), [{ type: "grab", x, y }]), 30);
}

/** A pointer y that puts the sprite top `gap` px below the ledge's underside. */
const justUnder = (gap: number) => ledge.bottom + gap;

describe("drag", () => {
  it("grab picks Mumu up by the scruff and follows the pointer", () => {
    const s = held(300, 400);
    expect(s.mode).toBe("held");
    expect(s.anim).toBe("held");
    expect(s.x).toBe(300);
    expect(s.y).toBe(400 + field.size);
    const moved = settle(act(s, [{ type: "move", x: 350, y: 300 }]), 30);
    expect(moved.x).toBe(350);
    expect(moved.y).toBe(364);
  });

  it("keeps Mumu on screen while dragged", () => {
    const s = settle(act(held(), [{ type: "move", x: -500, y: -500 }]), 30);
    expect(s.x).toBe(field.size / 2);
    expect(s.y).toBe(field.size);
    const t = settle(act(held(), [{ type: "move", x: 9999, y: 9999 }]), 30);
    expect(t.x).toBe(field.bounds.right - field.size / 2);
    expect(t.y).toBe(field.bounds.bottom);
  });

  it("does not wander or idle-switch while held", () => {
    const s = run(held(), 30);
    expect(s.mode).toBe("held");
    expect(s.anim).toBe("held");
    expect(s.x).toBe(300);
  });

  it("is interaction: resets the idle clock", () => {
    const idle = run(createMumuState(world, seq(0)), 5, { reducedMotion: true });
    expect(idle.idleFor).toBeGreaterThan(4);
    expect(act(idle, [{ type: "grab", x: 300, y: 400 }]).idleFor).toBe(0);
  });
});

describe("swing", () => {
  function drag(vxPerFrame: number, frames: number): MumuState {
    let s = held(300, 300);
    for (let i = 0; i < frames; i++) s = act(s, [{ type: "move", x: s.x + vxPerFrame, y: 300 }]);
    return s;
  }

  it("leans with horizontal velocity: right is positive, left is negative", () => {
    expect(drag(+8, 30).rotation).toBeGreaterThan(8);
    expect(drag(-8, 30).rotation).toBeLessThan(-8);
  });

  it("never rotates past +-25 degrees, however fast the drag", () => {
    let s = held(300, 300);
    for (let i = 0; i < 120; i++) {
      s = act(s, [{ type: "move", x: 300 + (i % 2 ? 250 : -250), y: 300 }]);
      expect(Math.abs(s.rotation)).toBeLessThanOrEqual(SWING_MAX_DEG);
    }
  });

  it("springs back to upright once the pointer stops", () => {
    const swung = drag(8, 30);
    expect(Math.abs(swung.rotation)).toBeGreaterThan(8);
    const rest = run(swung, 3);
    expect(Math.abs(rest.rotation)).toBeLessThan(0.5);
  });

  it("is zero for a still hold", () => {
    expect(Math.abs(run(held(), 2).rotation)).toBeLessThan(0.01);
  });
});

describe("drop", () => {
  it("falls with gravity and lands on the floor, sitting", () => {
    let s = act(held(300, 300), [{ type: "release" }]);
    expect(s.mode).toBe("falling");
    const y0 = s.y;
    s = run(s, 0.1);
    expect(s.vy).toBeGreaterThan(GRAVITY_PX_S2 * 0.08);
    expect(s.vy).toBeLessThan(GRAVITY_PX_S2 * 0.12);
    expect(s.y).toBeGreaterThan(y0);
    s = run(s, 2);
    expect(s.mode).toBe("ground");
    expect(s.y).toBe(world.floorY);
    expect(s.vy).toBe(0);
    expect(s.anim).toBe("sit");
  });

  it("released far below the floor line (dragged under the desk): jumps up onto the floor, never snapped", () => {
    let s = act(held(300, 600), [{ type: "release" }]);
    expect(s.y).toBeGreaterThan(world.floorY + 24);
    s = act(s);
    expect(s.mode).toBe("jumping");
    const y0 = s.y;
    s = act(s);
    expect(y0 - s.y).toBeLessThan(40);
    s = run(s, 1.5);
    expect(s.mode).toBe("ground");
    expect(s.y).toBe(world.floorY);
  });

  it("released only a little below the floor line: it rides back up smoothly", () => {
    let s = act(held(300, world.floorY - field.size + 10), [{ type: "release" }]);
    expect(s.y - world.floorY).toBeCloseTo(10, 5);
    s = act(s);
    expect(s.mode).toBe("ground");
    const y0 = s.y;
    s = act(s);
    expect(y0 - s.y).toBeLessThan(11);
    s = run(s, 0.5);
    expect(s.y).toBe(world.floorY);
  });

  it("lands where it fell (no clamping jump); if that is off the walkable floor it then walks back on", () => {
    const noLedges = { field: { ...field, ledges: [] } };
    let s = act(held(20, 400), [{ type: "release" }], noLedges);
    const fallX = s.x;
    while (s.mode === "falling") s = act(s, [], noLedges);
    expect(s.x).toBe(fallX); // straight down
    expect(s.x).toBeLessThan(world.minX);
    s = run(s, 2, noLedges);
    expect(s.mode).toBe("ground");
    expect(s.x).toBeGreaterThanOrEqual(world.minX - 1);
  });
});

describe("hang", () => {
  it("released within 24 px below a ledge: hangs from it for 3..6 s, then drops", () => {
    const s = act(held(300, justUnder(10)), [{ type: "release" }]);
    expect(s.mode).toBe("hanging");
    expect(s.anim).toBe("hang");
    expect(s.hangY).toBe(hangFeetY(ledge, field.size));
    expect(settle(s, 30).y).toBe(hangFeetY(ledge, field.size)); // pulled up onto the plank, not snapped
    expect(s.hangLeft).toBeGreaterThanOrEqual(HANG_MIN_S);
    expect(s.hangLeft).toBeLessThanOrEqual(HANG_MAX_S);

    expect(run(s, HANG_MIN_S - 0.5).mode).toBe("hanging");
    const dropped = run(s, HANG_MAX_S + 0.1);
    expect(dropped.mode).not.toBe("hanging");
    expect(run(dropped, 3).mode).toBe("ground");
  });

  it("the hang time comes from the rng", () => {
    const fast = act(held(300, justUnder(0)), [{ type: "release" }], {}, seq(0));
    const slow = act(held(300, justUnder(0)), [{ type: "release" }], {}, seq(0.999999));
    expect(fast.hangLeft).toBeCloseTo(HANG_MIN_S, 1);
    expect(slow.hangLeft).toBeCloseTo(HANG_MAX_S, 1);
  });

  it("released further than 24 px below the ledge: falls", () => {
    expect(act(held(300, justUnder(HANG_CATCH_PX + 6)), [{ type: "release" }]).mode).toBe("falling");
  });

  it("released above the plank: falls", () => {
    expect(act(held(300, ledge.top - 40), [{ type: "release" }]).mode).toBe("falling");
  });

  it("released beside a short ledge: falls", () => {
    const short: Playfield = { ...field, ledges: [{ left: 0, right: 150, top: 200, bottom: 220 }] };
    expect(act(held(400, justUnder(10)), [{ type: "release" }], { field: short }).mode).toBe("falling");
  });

  it("a hang under a narrow plank keeps the sprite within it", () => {
    const short: Playfield = { ...field, ledges: [{ left: 100, right: 300, top: 200, bottom: 220 }] };
    const s = act(held(290, justUnder(5)), [{ type: "release" }], { field: short });
    expect(s.mode).toBe("hanging");
    expect(s.hangX).toBeLessThanOrEqual(300 - field.size / 2);
    expect(settle(s, 30, { field: short }).x).toBeLessThanOrEqual(300 - field.size / 2);
  });

  it("still works with reduced motion (drag is allowed)", () => {
    expect(act(held(300, justUnder(10)), [{ type: "release" }], { reducedMotion: true }).mode).toBe("hanging");
  });
});

describe("climb", () => {
  it("released against the right edge: clings facing the wall, climbs to the ledge, then hangs", () => {
    let s = act(held(595, 450), [{ type: "release" }]);
    expect(s.mode).toBe("climbing");
    expect(s.anim).toBe("climb");
    expect(s.x).toBe(field.bounds.right - field.size / 2);
    expect(s.facing).toBe(1);
    const y0 = s.y;
    s = run(s, 1);
    expect(s.y).toBeCloseTo(y0 - climbSpeed(field.size), 0);
    for (let i = 0; i < 60 * 10 && s.mode === "climbing"; i++) s = act(s);
    expect(s.mode).toBe("hanging");
    expect(s.y).toBe(hangFeetY(ledge, field.size));
    expect(s.anim).toBe("hang");
  });

  it("the left edge climbs flush against the left edge", () => {
    const s = act(held(5, 450), [{ type: "release" }]);
    expect(s.mode).toBe("climbing");
    expect(s.anim).toBe("climb");
    expect(s.x).toBe(field.size / 2);
  });

  it("an edge drop that is also just under the ledge hangs instead of climbing", () => {
    expect(act(held(595, ledge.bottom + 4), [{ type: "release" }]).mode).toBe("hanging");
  });

  it("does not climb with reduced motion, or with no ledge above", () => {
    expect(act(held(595, 450), [{ type: "release" }], { reducedMotion: true }).mode).toBe("falling");
    expect(act(held(595, 450), [{ type: "release" }], { field: { ...field, ledges: [] } }).mode).toBe("falling");
  });

  it("does not climb when the edge is farther than the catch distance", () => {
    expect(act(held(600 - field.size / 2 - EDGE_CATCH_PX - 30, 450), [{ type: "release" }]).mode).toBe("falling");
  });

  it("picks the nearest ledge above", () => {
    const two: Playfield = { ...field, ledges: [{ left: 0, right: 600, top: 100, bottom: 120 }, ledge] };
    const s = act(held(595, 450), [{ type: "release" }], { field: two });
    expect(s.climbTargetY).toBe(hangFeetY(ledge, field.size));
  });

  const wide: World = { minX: 32, maxX: 568, floorY: 600 };

  it("walking into a screen edge climbs it, but never on other tabs", () => {
    const base: MumuState = { ...createMumuState(wide, seq(0)), anim: "walk", x: 560, walkTargetX: 568 };
    const s = step(base, { ...input, world: wide }, 1, seq(0.5));
    expect(s.mode).toBe("climbing");
    expect(s.facing).toBe(1);
    const calm = step(base, { ...input, world: wide, calm: true }, 1, seq(0.5));
    expect(calm.mode).toBe("ground");
  });

  it("idle life eventually walks to an edge, climbs, hangs, and comes back down", () => {
    const rng = mulberry(5);
    let s = createMumuState(wide, rng);
    const modes = new Set<string>();
    for (let i = 0; i < 60 * 600; i++) {
      s = step(s, { ...input, world: wide }, FRAME, rng);
      modes.add(s.mode);
      expect(s.y).toBeLessThanOrEqual(field.bounds.bottom);
      expect(s.y).toBeGreaterThanOrEqual(field.size);
      expect(s.x).toBeGreaterThanOrEqual(field.size / 2);
      expect(s.x).toBeLessThanOrEqual(field.bounds.right - field.size / 2);
    }
    expect([...modes].sort()).toEqual(["climbing", "falling", "ground", "hanging"]);
  });

  it("never climbs on other tabs, with reduced motion, or parked", () => {
    for (const extra of [{ calm: true }, { reducedMotion: true }, { parkAt: 568 }]) {
      const rng = mulberry(9);
      let s = createMumuState(wide, rng);
      for (let i = 0; i < 60 * 300; i++) {
        s = step(s, { ...input, world: wide, ...extra }, FRAME, rng);
        expect(s.mode).toBe("ground");
      }
    }
  });
});

describe("edge walking and the go-climb idle choice", () => {
  const wide: World = { minX: 32, maxX: 568, floorY: 600 };
  const noLedges: Playfield = { ...field, ledges: [] };
  const walking = (x: number, target: number): MumuState => ({ ...createMumuState(wide, seq(0)), anim: "walk", x, walkTargetX: target });

  it("climbs at 40 px/s at x3, scaled down with the sprite at x2", () => {
    expect(CLIMB_SPEED_AT_X3_PX_S).toBe(40);
    expect(climbSpeed(96)).toBeCloseTo(40);
    expect(climbSpeed(64)).toBeCloseTo((40 * 2) / 3);
  });

  it("walking into the right or left edge with a ledge above: climbs it", () => {
    const right = step(walking(560, 568), { ...input, world: wide }, 1, seq(0.5));
    expect(right.mode).toBe("climbing");
    expect(right.x).toBe(field.bounds.right - field.size / 2);
    const left = step(walking(40, 32), { ...input, world: wide }, 1, seq(0.5));
    expect(left.mode).toBe("climbing");
    expect(left.x).toBe(field.size / 2);
  });

  it("stays flush against the edge all the way up, even if the screen is resized", () => {
    let s = step(walking(560, 568), { ...input, world: wide }, 1, seq(0.5));
    s = run(s, 1);
    expect(s.x).toBe(568);
    const narrower: Playfield = { ...field, bounds: { ...field.bounds, right: 500 } };
    const once = act(s, [], { world: wide, field: narrower });
    expect(Math.abs(once.x - s.x)).toBeLessThan(5); // slides over, never jumps
    s = run(s, 1, { world: wide, field: narrower });
    expect(s.x).toBe(500 - field.size / 2);
  });

  it("switches to the front-view hang strip when it reaches the ledge", () => {
    let s = step(walking(560, 568), { ...input, world: wide }, 1, seq(0.5));
    expect(s.anim).toBe("climb");
    for (let i = 0; i < 60 * 20 && s.mode === "climbing"; i++) s = act(s, [], { world: wide });
    expect(s.mode).toBe("hanging");
    expect(s.anim).toBe("hang");
    expect(s.y).toBe(hangFeetY(ledge, field.size));
  });

  it("with no ledge above, walking into an edge just turns around and walks back", () => {
    const right = step(walking(560, 568), { ...input, world: wide, field: noLedges }, 1, seq(0.5));
    expect(right.mode).toBe("ground");
    expect(right.facing).toBe(-1);
    expect(right.anim).toBe("walk");
    expect(right.x).toBe(568);
    expect(568 - right.walkTargetX!).toBeGreaterThanOrEqual(WALK_MIN_DISTANCE_PX);
    const left = step(walking(40, 32), { ...input, world: wide, field: noLedges }, 1, seq(0.5));
    expect(left.facing).toBe(1);
    expect(left.walkTargetX! - 32).toBeGreaterThanOrEqual(WALK_MIN_DISTANCE_PX);
  });

  it("on other tabs, walking into an edge turns around even with a ledge above", () => {
    const s = step(walking(560, 568), { ...input, world: wide, calm: true }, 1, seq(0.5));
    expect(s.mode).toBe("ground");
    expect(s.facing).toBe(-1);
    expect(s.anim).toBe("walk");
  });

  it("idle walks reach edges and turn around when nothing is above (never leaving the floor)", () => {
    const rng = mulberry(21);
    let s = createMumuState(wide, rng);
    let turned = 0;
    let atEdge = false;
    for (let i = 0; i < 60 * 600; i++) {
      s = step(s, { ...input, world: wide, field: noLedges }, FRAME, rng);
      expect(s.mode).toBe("ground");
      expect(s.x).toBeGreaterThanOrEqual(wide.minX);
      expect(s.x).toBeLessThanOrEqual(wide.maxX);
      if (s.x <= wide.minX + 1 || s.x >= wide.maxX - 1) {
        atEdge = true;
        if (s.anim === "walk" && s.facing === (s.x <= wide.minX + 1 ? 1 : -1)) turned++;
      }
    }
    expect(atEdge).toBe(true);
    expect(turned).toBeGreaterThan(0);
  });

  describe("go climb", () => {
    const base = { calm: false, reducedMotion: false, canClimb: true };
    const share = (idleFor: number, opts: Partial<typeof base> = {}) => {
      const rng = mulberry(3);
      let n = 0;
      for (let i = 0; i < 20000; i++) if (pickIdleChoice(rng, { ...base, ...opts, idleFor }) === "climb") n++;
      return n / 20000;
    };

    it("is a 15 weight choice after 10 s idle", () => {
      expect(IDLE_WEIGHTS.climb).toBe(15);
      expect(CLIMB_AFTER_IDLE_S).toBe(10);
      expect(share(CLIMB_AFTER_IDLE_S)).toBeCloseTo(0.15, 1); // 15 of 100 before yarn joins at 20 s
    });

    it("is never offered before 10 s, without a climb, on other tabs, or with reduced motion", () => {
      expect(share(CLIMB_AFTER_IDLE_S - 0.1)).toBe(0);
      expect(share(999, { canClimb: false })).toBe(0);
      expect(share(999, { calm: true })).toBe(0);
      expect(share(999, { reducedMotion: true })).toBe(0);
    });

    it("walks to the nearer edge and climbs it", () => {
      for (const [x, edge] of [
        [500, 568],
        [100, 32],
      ] as const) {
        const start: MumuState = { ...createMumuState(wide, seq(0)), x, idleFor: 12, nextChoiceIn: 0.01 };
        // rng: next-interval roll, then the choice roll 0.95 * 100 = 95 -> past walk 30, sit 20, loaf 20, tailwag 15, into climb
        let s = step(start, { ...input, world: wide }, FRAME, seq(0.5, 0.95));
        expect(s.anim).toBe("walk");
        expect(s.walkTargetX).toBe(edge);
        expect(s.facing).toBe(edge > x ? 1 : -1);
        for (let i = 0; i < 60 * 20 && s.mode === "ground"; i++) s = act(s, [], { world: wide });
        expect(s.mode).toBe("climbing");
        expect(s.x).toBe(edge === 568 ? 568 : field.size / 2);
      }
    });

    it("startClimbWalk with no ledge above still walks to the edge, then turns around", () => {
      const start = createMumuState(wide, seq(0));
      let s = startClimbWalk({ ...start, x: 400 }, { ...input, world: wide, field: noLedges }, seq(0.5));
      expect(s.walkTargetX).toBe(568);
      for (let i = 0; i < 60 * 20 && s.x < 568; i++) s = act(s, [], { world: wide, field: noLedges });
      expect(s.mode).toBe("ground");
      expect(s.facing).toBe(-1);
    });

    it("startClimbWalk standing at the edge climbs at once", () => {
      const s = startClimbWalk({ ...createMumuState(wide, seq(0)), x: 568 }, { ...input, world: wide }, seq(0.5));
      expect(s.mode).toBe("climbing");
    });

    it("startClimbWalk sits if the floor doesn't reach a screen edge", () => {
      const s = startClimbWalk(createMumuState(world, seq(0)), input, seq(0.5));
      expect(s.mode).toBe("ground");
      expect(s.anim).toBe("sit");
    });
  });
});

describe("tap", () => {
  it("asks for the read-time bubble and an mrrp, and meows for a moment", () => {
    const s = act(createMumuState(world, seq(0)), [{ type: "tap" }]);
    expect(s.effects).toEqual([{ type: "readTime" }, { type: "sound", name: "mrrp" }]);
    expect(s.anim).toBe("meow");
    expect(s.purring).toBe(false);
    const next = act(s); // effects are one-shot
    expect(next.effects).toEqual([]);
    expect(next.anim).toBe("meow");
    expect(run(next, TAP_MEOW_S + 0.1).anim).toBe("sit");
  });

  it("stops a walk", () => {
    const walking: MumuState = { ...createMumuState(world, seq(0)), anim: "walk", walkTargetX: 450 };
    const s = act(walking, [{ type: "tap" }]);
    expect(s.walkTargetX).toBeNull();
    expect(s.anim).toBe("meow");
  });

  it("works while hanging (bubble, no pose change)", () => {
    const hanging = act(held(300, justUnder(5)), [{ type: "release" }]);
    const s = act(hanging, [{ type: "tap" }]);
    expect(s.mode).toBe("hanging");
    expect(s.anim).toBe("hang");
    expect(s.effects).toContainEqual({ type: "readTime" });
  });

  it("is ignored while held", () => {
    expect(act(held(), [{ type: "tap" }]).effects).toEqual([]);
  });
});

describe("pet", () => {
  const twoTaps = (gap: number): MumuState => {
    let s = act(createMumuState(world, seq(0)), [{ type: "tap" }]);
    s = run(s, gap);
    return act(s, [{ type: "tap" }]);
  };

  it("2 taps within 1.5 s: tail wag, purr, hearts; no second bubble", () => {
    const s = twoTaps(PET_TAP_WINDOW_S - 0.3);
    expect(s.anim).toBe("tailwag");
    expect(s.purring).toBe(true);
    expect(s.petLeft).toBeGreaterThan(0);
    expect(s.effects).toEqual([]);
    const later = run(s, 1.5, {}, mulberry(1));
    expect(later.emotes.length).toBeGreaterThanOrEqual(2);
    expect(later.emotes.every((e) => e.kind === "heart")).toBe(true);
  });

  it("2 taps further apart than 1.5 s are two read-time taps", () => {
    const s = twoTaps(PET_TAP_WINDOW_S + 0.3);
    expect(s.purring).toBe(false);
    expect(s.effects).toContainEqual({ type: "readTime" });
  });

  it("the first heart appears right away", () => {
    const s = act(twoTaps(0.3), [], {}, mulberry(2));
    expect(s.emotes).toHaveLength(1);
  });

  it("petting ends after its duration: stops purring, sits, hearts fade out", () => {
    let s = twoTaps(0.3);
    s = run(s, PET_DURATION_S + 0.5, {}, mulberry(3));
    expect(s.purring).toBe(false);
    expect(s.petLeft).toBe(0);
    expect(s.anim).toBe("sit");
    s = run(s, 2, {}, mulberry(3));
    expect(s.emotes).toEqual([]);
  });

  it("a further tap or stroke while petting extends it", () => {
    let s = twoTaps(0.3);
    s = run(s, 2, {}, mulberry(4));
    const left = s.petLeft;
    expect(act(s, [{ type: "tap" }]).petLeft).toBeGreaterThan(left);
    expect(act(s, [{ type: "stroke" }]).petLeft).toBeGreaterThan(left);
    expect(act(s, [{ type: "tap" }]).effects).toEqual([]);
  });

  it("a stroke pets straight away", () => {
    const s = act(createMumuState(world, seq(0)), [{ type: "stroke" }]);
    expect(s.purring).toBe(true);
    expect(s.anim).toBe("tailwag");
  });

  it("cancels a walk, and being picked up stops the purr", () => {
    const walking: MumuState = { ...createMumuState(world, seq(0)), anim: "walk", walkTargetX: 450 };
    const petted = act(walking, [{ type: "stroke" }]);
    expect(petted.walkTargetX).toBeNull();
    const picked = act(petted, [{ type: "grab", x: 300, y: 300 }]);
    expect(picked.purring).toBe(false);
    expect(picked.petLeft).toBe(0);
  });

  it("works in the reader corner too (parked)", () => {
    const s = act({ ...createMumuState(world, seq(0)), x: 480 }, [{ type: "stroke" }], { parkAt: 480 });
    expect(s.purring).toBe(true);
    expect(s.x).toBe(480);
  });

  it("is only for a cat on the ground", () => {
    const hanging = act(held(300, justUnder(5)), [{ type: "release" }]);
    expect(act(hanging, [{ type: "stroke" }]).purring).toBe(false);
  });
});

describe("grabbing from other modes", () => {
  it("a hanging cat can be grabbed, a falling cat can be caught", () => {
    const hanging = act(held(300, justUnder(5)), [{ type: "release" }]);
    expect(act(hanging, [{ type: "grab", x: 200, y: 300 }]).mode).toBe("held");
    const falling = act(held(300, 300), [{ type: "release" }]);
    const caught = act(falling, [{ type: "grab", x: 200, y: 300 }]);
    expect(caught.mode).toBe("held");
    expect(caught.vy).toBe(0);
  });

  it("a climbing cat can be grabbed", () => {
    const climbing = act(held(595, 450), [{ type: "release" }]);
    expect(act(climbing, [{ type: "grab", x: 300, y: 300 }]).mode).toBe("held");
  });

  it("a release with nothing held does nothing", () => {
    expect(act(createMumuState(world, seq(0)), [{ type: "release" }]).mode).toBe("ground");
  });

  it("forceAnim puts the cat back on the floor", () => {
    const hanging = act(held(300, justUnder(5)), [{ type: "release" }]);
    expect(forceAnim(hanging, "sit", world, seq(0)).mode).toBe("ground");
  });
});
