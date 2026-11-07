// Mumu's behaviour engine: pure (state + input + dt -> state), no DOM, no timers, no Math.random.
// C1 covers idle life and walking on the floor. Drag, drop, hang, climb, pet and tap arrive in C2.
import {
  CALM_CHOICES,
  CHOICE_ANIM,
  IDLE_MAX_S,
  IDLE_MIN_S,
  IDLE_WEIGHTS,
  REDUCED_MOTION_CHOICES,
  WALK_MIN_DISTANCE_PX,
  WALK_SPEED_PX_S,
  YARN_AFTER_IDLE_S,
  type IdleChoice,
} from "./constants.ts";
import type { World } from "./layout.ts";
import type { AnimName } from "./sprites.ts";

export type Rng = () => number;

export interface MumuState {
  anim: AnimName;
  /** Seconds since the current animation started (drives the frame). */
  animTime: number;
  /** Feet-centre x in viewport px. The feet sit on `world.floorY`. */
  x: number;
  /** 1 = facing right (art direction), -1 = mirrored. */
  facing: 1 | -1;
  /** Seconds until the next idle choice. */
  nextChoiceIn: number;
  /** Seconds since the last user interaction (gates yarn). */
  idleFor: number;
  /** Where a walk is heading, or null when not walking. */
  walkTargetX: number | null;
}

export interface EngineInput {
  world: World;
  /** Other tabs: walk, sit and loaf only. */
  calm: boolean;
  reducedMotion: boolean;
  /** The user touched Mumu or the app this frame; resets the idle clock. */
  interacted: boolean;
  /** Reader parking: sit at this x, no wandering (sit/loaf only). Null elsewhere. */
  parkAt?: number | null;
}

function randomBetween(rng: Rng, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

/** Weighted idle choice (F8). Yarn needs `idleFor >= YARN_AFTER_IDLE_S`; calm and reduced motion narrow the set. */
export function pickIdleChoice(rng: Rng, opts: { calm: boolean; reducedMotion: boolean; idleFor: number }): IdleChoice {
  let pool = Object.keys(IDLE_WEIGHTS) as IdleChoice[];
  if (opts.reducedMotion) pool = pool.filter((c) => REDUCED_MOTION_CHOICES.includes(c));
  else if (opts.calm) pool = pool.filter((c) => CALM_CHOICES.includes(c));
  if (opts.idleFor < YARN_AFTER_IDLE_S) pool = pool.filter((c) => c !== "yarn");
  const total = pool.reduce((sum, c) => sum + IDLE_WEIGHTS[c], 0);
  let roll = rng() * total;
  for (const choice of pool) {
    roll -= IDLE_WEIGHTS[choice];
    if (roll < 0) return choice;
  }
  // rng() === 1 or float edge: the last entry owns the top of the range.
  return pool[pool.length - 1]!;
}

export function createMumuState(world: World, rng: Rng): MumuState {
  return {
    anim: "sit",
    animTime: 0,
    x: (world.minX + world.maxX) / 2,
    facing: 1,
    nextChoiceIn: randomBetween(rng, IDLE_MIN_S, IDLE_MAX_S),
    idleFor: 0,
    walkTargetX: null,
  };
}

function setAnim(state: MumuState, anim: AnimName): MumuState {
  return state.anim === anim ? state : { ...state, anim, animTime: 0 };
}

function startWalk(state: MumuState, world: World, rng: Rng): MumuState {
  // A target at least WALK_MIN_DISTANCE_PX away, on a side that has room.
  const room = [
    { side: -1 as const, span: state.x - WALK_MIN_DISTANCE_PX - world.minX },
    { side: 1 as const, span: world.maxX - (state.x + WALK_MIN_DISTANCE_PX) },
  ].filter((r) => r.span >= 0);
  if (room.length === 0) return setAnim({ ...state, walkTargetX: null }, "sit");
  const pick = room[Math.floor(rng() * room.length)]!;
  const target = state.x + pick.side * (WALK_MIN_DISTANCE_PX + rng() * pick.span);
  return { ...setAnim(state, "walk"), walkTargetX: target, facing: pick.side };
}

/** Switch to an animation now (MumuLab buttons; later: scene reactions). Holds it for a normal idle interval. */
export function forceAnim(state: MumuState, anim: AnimName, world: World, rng: Rng): MumuState {
  const held = { ...state, walkTargetX: null, nextChoiceIn: randomBetween(rng, IDLE_MIN_S, IDLE_MAX_S) };
  return anim === "walk" ? startWalk(held, world, rng) : setAnim(held, anim);
}

export function step(state: MumuState, input: EngineInput, dt: number, rng: Rng): MumuState {
  const { world } = input;
  const parked = input.parkAt != null;
  // Reduced motion and reader parking both mean: stay put, sit/loaf only.
  const still = input.reducedMotion || parked;
  let s: MumuState = {
    ...state,
    animTime: state.animTime + dt,
    idleFor: input.interacted ? 0 : state.idleFor + dt,
    x: Math.min(Math.max(parked ? input.parkAt! : state.x, world.minX), world.maxX),
    facing: parked ? -1 : state.facing, // the reader corner is on the right: look into the page
  };

  if (still && s.walkTargetX !== null) {
    s = setAnim({ ...s, walkTargetX: null }, "sit");
  }

  if (s.walkTargetX !== null) {
    const target = Math.min(Math.max(s.walkTargetX, world.minX), world.maxX);
    const remaining = target - s.x;
    const move = WALK_SPEED_PX_S * dt;
    if (Math.abs(remaining) <= move) {
      s = setAnim({ ...s, x: target, walkTargetX: null, nextChoiceIn: randomBetween(rng, IDLE_MIN_S, IDLE_MAX_S) }, "sit");
    } else {
      s = { ...s, x: s.x + Math.sign(remaining) * move, facing: remaining > 0 ? 1 : -1 };
    }
    return s;
  }

  s = { ...s, nextChoiceIn: s.nextChoiceIn - dt };
  if (s.nextChoiceIn > 0) return s;

  s = { ...s, nextChoiceIn: randomBetween(rng, IDLE_MIN_S, IDLE_MAX_S) };
  const choice = pickIdleChoice(rng, { calm: input.calm, reducedMotion: still, idleFor: s.idleFor });
  return choice === "walk" ? startWalk(s, world, rng) : setAnim(s, CHOICE_ANIM[choice]);
}
