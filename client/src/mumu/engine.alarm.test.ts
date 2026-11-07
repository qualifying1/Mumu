// C3 engine tests: the long-reading alarm. The reader is a 390x700 screen with Mumu parked bottom-right.
// Mumu walks to the middle, climbs up the middle of the reading panel, clings there meowing, and stays until petted.
// Whatever it does, it never teleports.
import { describe, expect, it } from "vitest";
import { ALARM_MEOW_EVERY_S, HURRY_WALK_SPEED_PX_S, PET_DURATION_S, PET_TAP_WINDOW_S } from "./constants.ts";
import { alarmClimbSpeed, createMumuState, perchSpot, step, type EngineInput, type MumuState, type Rng } from "./engine.ts";
import type { MumuAction } from "./gesture.ts";
import type { Playfield, World } from "./layout.ts";

const world: World = { minX: 36, maxX: 352, floorY: 700 };
const field: Playfield = { size: 64, bounds: { left: 0, right: 390, top: 0, bottom: 700 }, ledges: [] };
const CENTRE = 195;
const SPOT = perchSpot(field); // { x: 195, y: 382 }
const input: EngineInput = { world, field, calm: false, reducedMotion: false, interacted: false, parkAt: 352, alarm: false };
const FRAME = 1 / 60;
/** No frame may move Mumu further than this: the fastest legitimate thing is a fall (about 21 px/frame from the top). */
const MAX_FRAME_MOVE_PX = 40;

const zero: Rng = () => 0;
const half: Rng = () => 0.5;

function parked(): MumuState {
  return { ...createMumuState(world, zero), x: 352 };
}

function act(s: MumuState, extra: Partial<EngineInput> = {}, actions: MumuAction[] = []): MumuState {
  return step(s, { ...input, ...extra, actions }, FRAME, half);
}

interface Run {
  state: MumuState;
  sounds: string[];
  effects: string[];
}

/** Step for `seconds`, collecting effects and asserting that Mumu never teleports. */
function run(s: MumuState, seconds: number, extra: Partial<EngineInput> = {}): Run {
  const sounds: string[] = [];
  const effects: string[] = [];
  for (let i = 0; i < Math.round(seconds / FRAME); i++) {
    const next = act(s, extra);
    expect(Math.hypot(next.x - s.x, next.y - s.y)).toBeLessThanOrEqual(MAX_FRAME_MOVE_PX);
    s = next;
    for (const e of s.effects) {
      effects.push(e.type);
      if (e.type === "sound") sounds.push(e.name);
    }
  }
  return { state: s, sounds, effects };
}

const alarm = { alarm: true };

/** Mumu clinging in the middle of the page with the alarm ringing. */
function perched(): MumuState {
  const s = run(parked(), 12, alarm).state;
  expect(s.mode).toBe("perched");
  return s;
}

describe("alarm approach", () => {
  it("leaves the corner on foot, heading for the middle of the screen at a brisk walk", () => {
    let s = act(parked(), alarm);
    expect(s.alarmOn).toBe(true);
    expect(s.anim).toBe("walk");
    expect(s.facing).toBe(-1);
    const x0 = s.x;
    s = run(s, 1, alarm).state;
    expect(x0 - s.x).toBeCloseTo(HURRY_WALK_SPEED_PX_S, -1);
    expect(s.y).toBe(world.floorY); // still on the floor
  });

  it("then climbs up the middle of the reading panel (back view), faster than the shelf climb", () => {
    let s = parked();
    for (let i = 0; i < 60 * 10 && s.mode !== "perching"; i++) s = act(s, alarm);
    expect(s.mode).toBe("perching");
    expect(s.anim).toBe("climb");
    expect(s.x).toBeCloseTo(CENTRE, 0);
    const y0 = s.y;
    s = run(s, 1, alarm).state;
    expect(y0 - s.y).toBeCloseTo(alarmClimbSpeed(field.size), 0);
    expect(s.x).toBeCloseTo(CENTRE, 0);
  });

  it("ends up clinging in the middle of the panel with the front-view hang pose, and stays for as long as the alarm rings", () => {
    const s = perched();
    expect(s.x).toBe(SPOT.x);
    expect(s.y).toBe(SPOT.y);
    expect(s.anim).toBe("hang");
    const later = run(s, 120, alarm).state;
    expect(later.mode).toBe("perched");
    expect(later.x).toBe(SPOT.x);
    expect(later.y).toBe(SPOT.y);
  });

  it("does not wander off on the way: only walk, climb and cling animations", () => {
    let s = parked();
    for (let i = 0; i < 60 * 60; i++) {
      s = act(s, alarm);
      expect(["walk", "climb", "hang"]).toContain(s.anim);
    }
  });

  it("with reduced motion it walks to the middle and stays on the floor (no climbing)", () => {
    const { state } = run(parked(), 8, { ...alarm, reducedMotion: true });
    expect(state.mode).toBe("ground");
    expect(state.y).toBe(world.floorY);
    expect(state.x).toBeCloseTo(CENTRE, 0);
    expect(state.anim).toBe("meow");
  });

  it("stops a petting in progress when the alarm starts", () => {
    const petted = act(parked(), {}, [{ type: "stroke" }]);
    expect(petted.purring).toBe(true);
    const s = act(petted, alarm);
    expect(s.purring).toBe(false);
    expect(s.petLeft).toBe(0);
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

describe("petting is how the alarm ends", () => {
  it("a single tap changes nothing: no read-time bubble, no petting, still ringing", () => {
    const s = act(perched(), alarm, [{ type: "tap" }]);
    expect(s.effects).toEqual([]);
    expect(s.purring).toBe(false);
    expect(s.mode).toBe("perched");
  });

  it("two taps within 1.5 s pet him: purr, hearts, and exactly one alarmPetted", () => {
    let s = act(perched(), alarm, [{ type: "tap" }]);
    s = run(s, PET_TAP_WINDOW_S - 0.4, alarm).state;
    s = act(s, alarm, [{ type: "tap" }]);
    expect(s.effects).toEqual([{ type: "alarmPetted" }]);
    expect(s.purring).toBe(true);
    // The adapter reacts by snoozing the timer: the alarm input drops. He keeps being petted.
    const during = run(s, 1.5, { alarm: false });
    expect(during.state.purring).toBe(true);
    expect(during.state.emotes.length).toBeGreaterThan(0);
    expect(during.effects).not.toContain("alarmPetted");
  });

  it("two taps further apart than that are not a pet", () => {
    let s = act(perched(), alarm, [{ type: "tap" }]);
    s = run(s, PET_TAP_WINDOW_S + 0.4, alarm).state;
    s = act(s, alarm, [{ type: "tap" }]);
    expect(s.effects).toEqual([]);
    expect(s.purring).toBe(false);
  });

  it("stroking the cursor across him pets him too", () => {
    const s = act(perched(), alarm, [{ type: "stroke" }]);
    expect(s.effects).toEqual([{ type: "alarmPetted" }]);
    expect(s.purring).toBe(true);
  });

  it("once petted he keeps clinging while petted, then drops, lands, and walks back to his corner and sits", () => {
    let s = act(perched(), alarm, [{ type: "stroke" }]);
    // alarm dropped (snoozed) from here on
    const clinging = run(s, PET_DURATION_S - 0.5, { alarm: false });
    expect(clinging.state.mode).toBe("perched");
    expect(clinging.state.y).toBe(SPOT.y);
    s = run(clinging.state, 1.5, { alarm: false }).state;
    expect(["falling", "ground"]).toContain(s.mode);
    s = run(s, 12, { alarm: false }).state;
    expect(s.mode).toBe("ground");
    expect(s.y).toBe(world.floorY);
    expect(s.x).toBe(352);
    expect(["sit", "loaf"]).toContain(s.anim);
    expect(s.purring).toBe(false);
  });

  it("petting him while he is still walking in also ends it: he stops, is petted, and goes home on foot (never climbs)", () => {
    let s = run(parked(), 1, alarm).state;
    expect(s.mode).toBe("ground");
    s = act(s, alarm, [{ type: "stroke" }]);
    expect(s.effects).toEqual([{ type: "alarmPetted" }]);
    const after = run(s, 20, { alarm: false });
    expect(after.state.mode).toBe("ground");
    expect(after.state.x).toBe(352);
  });

  it("he can be picked up while it rings; dropped, he falls and goes straight back to climbing", () => {
    let s = perched();
    s = act(s, alarm, [{ type: "grab", x: 100, y: 300 }]);
    expect(s.mode).toBe("held");
    s = run(s, 0.5, alarm).state;
    s = act(s, alarm, [{ type: "release" }]);
    expect(s.mode).toBe("falling");
    s = run(s, 25, alarm).state;
    expect(s.mode).toBe("perched");
    expect(s.x).toBe(SPOT.x);
    expect(s.y).toBe(SPOT.y);
  });
});

describe("alarm ends some other way (Take a break, or leaving the reader)", () => {
  it("clinging Mumu drops, lands, and walks back to the corner, no meows after the alarm", () => {
    const s = perched();
    const after = run(s, 14, { alarm: false });
    expect(after.state.mode).toBe("ground");
    expect(after.state.x).toBe(352);
    expect(after.sounds).toEqual([]);
    expect(["sit", "loaf"]).toContain(after.state.anim);
  });

  it("while still on the floor it just walks back", () => {
    const s = run(parked(), 1, alarm).state;
    const after = run(s, 10, { alarm: false });
    expect(after.state.x).toBe(352);
    expect(after.state.mode).toBe("ground");
  });
});
