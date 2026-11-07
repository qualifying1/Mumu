// C3 engine tests: the long-reading alarm (SPEC F8). The reader is a 390 px wide screen with Mumu parked bottom-right.
import { describe, expect, it } from "vitest";
import { ALARM_MEOW_EVERY_S, WALK_SPEED_PX_S } from "./constants.ts";
import { createMumuState, step, type EngineInput, type MumuState, type Rng } from "./engine.ts";
import type { MumuAction } from "./gesture.ts";
import type { Playfield, World } from "./layout.ts";

const world: World = { minX: 36, maxX: 352, floorY: 700 };
const field: Playfield = { size: 64, bounds: { left: 0, right: 390, top: 0, bottom: 700 }, ledges: [] };
const CENTRE = 195;
const input: EngineInput = { world, field, calm: false, reducedMotion: false, interacted: false, parkAt: 352, alarm: false };
const FRAME = 1 / 60;

const zero: Rng = () => 0;
const half: Rng = () => 0.5;

function parked(): MumuState {
  return { ...createMumuState(world, zero), x: 352 };
}

function act(s: MumuState, extra: Partial<EngineInput> = {}, actions: MumuAction[] = []): MumuState {
  return step(s, { ...input, ...extra, actions }, FRAME, half);
}

/** Step for `seconds`, collecting every effect. */
function run(s: MumuState, seconds: number, extra: Partial<EngineInput> = {}): { state: MumuState; sounds: string[] } {
  const sounds: string[] = [];
  for (let i = 0; i < Math.round(seconds / FRAME); i++) {
    s = act(s, extra);
    for (const e of s.effects) if (e.type === "sound") sounds.push(e.name);
  }
  return { state: s, sounds };
}

const alarm = { alarm: true };

describe("alarm start", () => {
  it("leaves the corner and walks to bottom-centre at walking speed", () => {
    let s = act(parked(), alarm);
    expect(s.alarmOn).toBe(true);
    expect(s.anim).toBe("walk");
    expect(s.facing).toBe(-1); // heading left
    const x0 = s.x;
    s = run(s, 1, alarm).state;
    expect(x0 - s.x).toBeCloseTo(WALK_SPEED_PX_S, -1);
  });

  it("arrives at the centre and sits there with its mouth open, for as long as the alarm lasts", () => {
    const { state } = run(parked(), 6, alarm);
    expect(state.x).toBe(CENTRE);
    expect(state.anim).toBe("meow");
    expect(state.y).toBe(world.floorY);
    expect(run(state, 60, alarm).state.anim).toBe("meow");
    expect(run(state, 60, alarm).state.x).toBe(CENTRE);
  });

  it("does not wander off, whatever the idle clock says", () => {
    let s = parked();
    for (let i = 0; i < 60 * 120; i++) {
      s = act(s, alarm);
      if (i > 60 * 6) expect(s.anim).toBe("meow");
      expect(["walk", "meow"]).toContain(s.anim);
    }
  });

  it("stops a petting in progress", () => {
    const petted = act(parked(), {}, [{ type: "stroke" }]);
    expect(petted.purring).toBe(true);
    const s = act(petted, alarm);
    expect(s.purring).toBe(false);
    expect(s.petLeft).toBe(0);
  });

  it("with reduced motion it does not walk: it is simply at the centre", () => {
    const s = act(parked(), { ...alarm, reducedMotion: true });
    expect(s.x).toBe(CENTRE);
    expect(s.anim).toBe("meow");
  });
});

describe("alarm meows", () => {
  it("meows at once, then every 2.5 s, rotating meow1, meow2, meow3", () => {
    const { sounds } = run(parked(), ALARM_MEOW_EVERY_S * 5 + 0.2, alarm);
    expect(sounds).toEqual(["meow1", "meow2", "meow3", "meow1", "meow2", "meow3"]);
  });

  it("makes four meows in the first 8 s (at 0, 2.5, 5 and 7.5)", () => {
    expect(run(parked(), 8, alarm).sounds).toHaveLength(4);
  });

  it("makes none without an alarm", () => {
    expect(run(parked(), 30).sounds).toEqual([]);
  });

  it("restarts the rotation at meow1 for each new alarm", () => {
    const first = run(parked(), 3, alarm);
    const quiet = run(first.state, 1);
    expect(quiet.state.alarmOn).toBe(false);
    expect(run(quiet.state, 0.1, alarm).sounds).toEqual(["meow1"]);
  });
});

describe("alarm interactions", () => {
  it("taps and strokes do nothing while it rings (no read-time bubble, no petting)", () => {
    const { state } = run(parked(), 6, alarm);
    const tapped = act(state, alarm, [{ type: "tap" }]);
    expect(tapped.effects.filter((e) => e.type === "readTime")).toEqual([]);
    expect(tapped.anim).toBe("meow");
    const stroked = act(state, alarm, [{ type: "stroke" }]);
    expect(stroked.purring).toBe(false);
  });

  it("Mumu can still be picked up, and goes back to the centre after it lands", () => {
    let s = run(parked(), 6, alarm).state;
    s = act(s, alarm, [{ type: "grab", x: 100, y: 300 }]);
    expect(s.mode).toBe("held");
    s = act(s, alarm, [{ type: "release" }]);
    s = run(s, 10, alarm).state;
    expect(s.mode).toBe("ground");
    expect(s.x).toBe(CENTRE);
    expect(s.anim).toBe("meow");
  });
});

describe("alarm end", () => {
  it("sits again when the alarm drops (snooze or break), and then returns to its corner", () => {
    const ringing = run(parked(), 6, alarm).state;
    expect(ringing.alarmOn).toBe(true);
    const s = act(ringing, { alarm: false });
    expect(s.alarmOn).toBe(false);
    expect(s.anim).not.toBe("meow");
    // Reader parking resumes: back in the corner, sitting, no more meows.
    const after = run(s, 2);
    expect(after.state.x).toBe(352);
    expect(after.sounds).toEqual([]);
    expect(["sit", "loaf"]).toContain(after.state.anim);
  });
});
