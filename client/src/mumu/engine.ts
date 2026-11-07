// Mumu's behaviour engine: pure (state + input + dt -> state), no DOM, no timers, no Math.random.
// C1: idle life and walking on the floor. C2: drag (swing), drop (gravity), hang, climb, pet, tap.
// One-shot outputs (sounds, "show the read time") are listed in `state.effects`, rebuilt on every step.
import {
  CALM_CHOICES,
  CHOICE_ANIM,
  CLIMB_EDGE_WALK_CHANCE,
  CLIMB_SPEED_PX_S,
  DRAG_VELOCITY_SMOOTHING,
  EDGE_CATCH_PX,
  EMOTE_LIFE_S,
  GRAVITY_PX_S2,
  HANG_CATCH_PX,
  HANG_MAX_S,
  HANG_MIN_S,
  HEART_EVERY_S,
  IDLE_MAX_S,
  IDLE_MIN_S,
  IDLE_WEIGHTS,
  PET_DURATION_S,
  PET_TAP_WINDOW_S,
  REDUCED_MOTION_CHOICES,
  SWING_DAMPING,
  SWING_DEG_PER_PX_S,
  SWING_MAX_DEG,
  SWING_SPRING,
  TAP_MEOW_S,
  WALK_MIN_DISTANCE_PX,
  WALK_SPEED_PX_S,
  YARN_AFTER_IDLE_S,
  type IdleChoice,
} from "./constants.ts";
import type { MumuAction } from "./gesture.ts";
import type { Ledge, Playfield, World } from "./layout.ts";
import type { AnimName } from "./sprites.ts";

export type Rng = () => number;

export type Mode = "ground" | "held" | "falling" | "hanging" | "climbing";

export interface Emote {
  id: number;
  kind: "heart";
  /** Seconds since it spawned. */
  age: number;
  /** Horizontal offset from Mumu's centre in px. */
  dx: number;
}

export type MumuSoundName = "mrrp";
/** One-shot outputs for the adapter. Rebuilt on every step. */
export type Effect = { type: "sound"; name: MumuSoundName } | { type: "readTime" };

export interface MumuState {
  anim: AnimName;
  /** Seconds since the current animation started (drives the frame). */
  animTime: number;
  /** Feet-centre x in viewport px. */
  x: number;
  /** Feet y in viewport px: the floor on the ground, the pointer while held, etc. */
  y: number;
  /** 1 = facing right (art direction), -1 = mirrored. */
  facing: 1 | -1;
  /** Seconds until the next idle choice. */
  nextChoiceIn: number;
  /** Seconds since the last user interaction (gates yarn). */
  idleFor: number;
  /** Where a walk is heading, or null when not walking. */
  walkTargetX: number | null;
  /** When the walk ends at a screen edge: -1 left, 1 right; the cat then climbs. */
  climbAfterWalk: -1 | 1 | null;

  mode: Mode;
  /** Seconds the engine has run (the clock for the tap window). */
  time: number;
  /** Falling speed, px/s. */
  vy: number;
  /** Smoothed horizontal drag speed, px/s (drives the swing). */
  dragVx: number;
  /** Swing angle in degrees and its angular speed. */
  rotation: number;
  angVel: number;
  hangLeft: number;
  /** Climbing: the feet y to reach, and which screen edge is being climbed. */
  climbTargetY: number;
  climbLedge: Ledge | null;

  lastTapAt: number | null;
  /** Seconds of petting left; > 0 means being petted. */
  petLeft: number;
  heartIn: number;
  /** True while the purr should be playing. */
  purring: boolean;
  /** Seconds left of the tap-reply meow. */
  meowLeft: number;

  emotes: Emote[];
  nextEmoteId: number;
  effects: Effect[];
}

export interface EngineInput {
  world: World;
  field: Playfield;
  /** Other tabs: walk, sit and loaf only. */
  calm: boolean;
  reducedMotion: boolean;
  /** The user touched Mumu or the app this frame; resets the idle clock. */
  interacted: boolean;
  /** Reader parking: sit at this x, no wandering (sit/loaf only). Null elsewhere. */
  parkAt?: number | null;
  /** Pointer gestures since the last step, in order. */
  actions?: readonly MumuAction[];
}

function randomBetween(rng: Rng, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
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
    y: world.floorY,
    facing: 1,
    nextChoiceIn: randomBetween(rng, IDLE_MIN_S, IDLE_MAX_S),
    idleFor: 0,
    walkTargetX: null,
    climbAfterWalk: null,
    mode: "ground",
    time: 0,
    vy: 0,
    dragVx: 0,
    rotation: 0,
    angVel: 0,
    hangLeft: 0,
    climbTargetY: 0,
    climbLedge: null,
    lastTapAt: null,
    petLeft: 0,
    heartIn: 0,
    purring: false,
    meowLeft: 0,
    emotes: [],
    nextEmoteId: 1,
    effects: [],
  };
}

function setAnim(state: MumuState, anim: AnimName): MumuState {
  return state.anim === anim ? state : { ...state, anim, animTime: 0 };
}

// ---- geometry ----

/** Feet y that a cat hanging from `ledge` has (sprite top touches the plank's underside). */
export function hangFeetY(ledge: Ledge, size: number): number {
  return ledge.bottom + size;
}

/** Screen edges (-1 left, 1 right) that Mumu can reach on this floor and climb. */
function climbableEdges(world: World, field: Playfield): Array<-1 | 1> {
  const half = field.size / 2;
  const edges: Array<-1 | 1> = [];
  if (world.minX - (field.bounds.left + half) <= EDGE_CATCH_PX) edges.push(-1);
  if (field.bounds.right - half - world.maxX <= EDGE_CATCH_PX) edges.push(1);
  return edges;
}

/** The nearest ledge above `feetY` whose hanging spot is higher up than where the cat is. */
function ledgeAbove(field: Playfield, feetY: number): Ledge | null {
  let best: Ledge | null = null;
  for (const l of field.ledges) {
    const target = hangFeetY(l, field.size);
    if (target >= feetY - 1) continue;
    if (!best || target > hangFeetY(best, field.size)) best = l;
  }
  return best;
}

function edgeX(field: Playfield, side: -1 | 1): number {
  const half = field.size / 2;
  return side === -1 ? field.bounds.left + half : field.bounds.right - half;
}

// ---- transitions ----

function startWalk(state: MumuState, world: World, rng: Rng, climbSides: Array<-1 | 1> = [], field?: Playfield): MumuState {
  // Sometimes the walk heads for a screen edge, and Mumu climbs it on arrival.
  if (climbSides.length > 0 && field && rng() < CLIMB_EDGE_WALK_CHANCE) {
    const side = climbSides[Math.floor(rng() * climbSides.length)]!;
    const target = side === -1 ? world.minX : world.maxX;
    if (Math.abs(target - state.x) >= 1) {
      return { ...setAnim(state, "walk"), walkTargetX: target, facing: target > state.x ? 1 : -1, climbAfterWalk: side };
    }
  }
  // A target at least WALK_MIN_DISTANCE_PX away, on a side that has room.
  const room = [
    { side: -1 as const, span: state.x - WALK_MIN_DISTANCE_PX - world.minX },
    { side: 1 as const, span: world.maxX - (state.x + WALK_MIN_DISTANCE_PX) },
  ].filter((r) => r.span >= 0);
  if (room.length === 0) return setAnim({ ...state, walkTargetX: null, climbAfterWalk: null }, "sit");
  const pick = room[Math.floor(rng() * room.length)]!;
  const target = state.x + pick.side * (WALK_MIN_DISTANCE_PX + rng() * pick.span);
  return { ...setAnim(state, "walk"), walkTargetX: target, facing: pick.side, climbAfterWalk: null };
}

/** Switch to an animation now (MumuLab buttons; later: scene reactions). Holds it for a normal idle interval. */
export function forceAnim(state: MumuState, anim: AnimName, world: World, rng: Rng): MumuState {
  const held: MumuState = {
    ...state,
    mode: "ground",
    walkTargetX: null,
    climbAfterWalk: null,
    petLeft: 0,
    purring: false,
    meowLeft: 0,
    vy: 0,
    nextChoiceIn: randomBetween(rng, IDLE_MIN_S, IDLE_MAX_S),
  };
  return anim === "walk" ? startWalk(held, world, rng) : setAnim(held, anim);
}

function startHang(s: MumuState, ledge: Ledge, field: Playfield, rng: Rng): MumuState {
  const half = field.size / 2;
  return setAnim(
    {
      ...s,
      mode: "hanging",
      x: clamp(s.x, ledge.left + half, Math.max(ledge.left + half, ledge.right - half)),
      y: hangFeetY(ledge, field.size),
      vy: 0,
      hangLeft: randomBetween(rng, HANG_MIN_S, HANG_MAX_S),
      climbLedge: null,
      walkTargetX: null,
      climbAfterWalk: null,
    },
    "hang",
  );
}

function startClimb(s: MumuState, side: -1 | 1, ledge: Ledge, field: Playfield): MumuState {
  return setAnim(
    {
      ...s,
      mode: "climbing",
      x: edgeX(field, side),
      facing: side, // the sprite clings to a wall on its right; mirror for the left edge
      climbLedge: ledge,
      climbTargetY: hangFeetY(ledge, field.size),
      walkTargetX: null,
      climbAfterWalk: null,
      vy: 0,
    },
    "climb",
  );
}

function startFall(s: MumuState): MumuState {
  return setAnim({ ...s, mode: "falling", vy: 0, walkTargetX: null, climbAfterWalk: null }, "held");
}

function startPet(s: MumuState): MumuState {
  return setAnim({ ...s, petLeft: PET_DURATION_S, heartIn: 0, purring: true, meowLeft: 0, walkTargetX: null, climbAfterWalk: null }, "tailwag");
}

/** Release rules (F8): just under a ledge -> hang; against a side edge -> climb; otherwise fall. */
function resolveRelease(s: MumuState, input: EngineInput, rng: Rng): MumuState {
  const { field } = input;
  const top = s.y - field.size;
  let catchLedge: Ledge | null = null;
  let bestGap = Infinity;
  for (const l of field.ledges) {
    const gap = top - l.bottom; // > 0: below the plank
    if (s.x < l.left || s.x > l.right) continue;
    if (top < l.top || gap > HANG_CATCH_PX) continue;
    if (Math.abs(gap) < bestGap) {
      bestGap = Math.abs(gap);
      catchLedge = l;
    }
  }
  if (catchLedge) return startHang(s, catchLedge, field, rng);

  const half = field.size / 2;
  const nearLeft = s.x - half - field.bounds.left <= EDGE_CATCH_PX;
  const nearRight = field.bounds.right - (s.x + half) <= EDGE_CATCH_PX;
  if ((nearLeft || nearRight) && !input.reducedMotion) {
    const ledge = ledgeAbove(field, s.y);
    if (ledge) return startClimb(s, nearLeft ? -1 : 1, ledge, field);
  }
  return startFall(s);
}

function applyActions(s: MumuState, input: EngineInput, rng: Rng): MumuState {
  const { field } = input;
  const half = field.size / 2;
  for (const action of input.actions ?? []) {
    switch (action.type) {
      case "grab":
      case "move": {
        if (action.type === "grab" && s.mode !== "held") {
          s = setAnim(
            {
              ...s,
              mode: "held",
              walkTargetX: null,
              climbAfterWalk: null,
              petLeft: 0,
              purring: false,
              meowLeft: 0,
              hangLeft: 0,
              climbLedge: null,
              vy: 0,
              dragVx: 0,
              lastTapAt: null,
            },
            "held",
          );
        }
        if (s.mode !== "held") break;
        // Mumu hangs by the scruff from the pointer: the pointer is the top centre of the sprite.
        s = {
          ...s,
          x: clamp(action.x, field.bounds.left + half, field.bounds.right - half),
          y: clamp(action.y + field.size, field.bounds.top + field.size, field.bounds.bottom),
        };
        break;
      }
      case "release":
        if (s.mode === "held") s = resolveRelease(s, input, rng);
        break;
      case "tap":
        if (s.mode === "held") break;
        if (s.mode === "ground" && s.lastTapAt !== null && s.time - s.lastTapAt <= PET_TAP_WINDOW_S) {
          s = { ...startPet(s), lastTapAt: s.time };
        } else if (s.mode === "ground" && s.petLeft > 0) {
          s = { ...s, petLeft: PET_DURATION_S, lastTapAt: s.time };
        } else {
          const reply = s.mode === "ground" ? { ...setAnim(s, "meow"), meowLeft: TAP_MEOW_S, walkTargetX: null, climbAfterWalk: null } : s;
          s = { ...reply, lastTapAt: s.time, effects: [...s.effects, { type: "readTime" }, { type: "sound", name: "mrrp" }] };
        }
        break;
      case "stroke":
        if (s.mode !== "ground") break;
        s = s.petLeft > 0 ? { ...s, petLeft: PET_DURATION_S } : startPet(s);
        break;
    }
  }
  return s;
}

function stepSwing(s: MumuState, dt: number): MumuState {
  const target = s.mode === "held" ? clamp(s.dragVx * SWING_DEG_PER_PX_S, -SWING_MAX_DEG, SWING_MAX_DEG) : 0;
  const acc = -SWING_SPRING * (s.rotation - target) - SWING_DAMPING * s.angVel;
  const angVel = s.angVel + acc * dt;
  const raw = s.rotation + angVel * dt;
  const rotation = clamp(raw, -SWING_MAX_DEG, SWING_MAX_DEG);
  return { ...s, angVel: rotation === raw ? angVel : 0, rotation };
}

function stepEmotes(s: MumuState, dt: number): MumuState {
  return { ...s, emotes: s.emotes.map((e) => ({ ...e, age: e.age + dt })).filter((e) => e.age < EMOTE_LIFE_S) };
}

function stepGround(state: MumuState, input: EngineInput, dt: number, rng: Rng): MumuState {
  const { world } = input;
  const parked = input.parkAt != null;
  // Reduced motion and reader parking both mean: stay put, sit/loaf only.
  const still = input.reducedMotion || parked;
  let s: MumuState = {
    ...state,
    y: world.floorY,
    x: clamp(parked ? input.parkAt! : state.x, world.minX, world.maxX),
    facing: parked ? -1 : state.facing, // the reader corner is on the right: look into the page
  };

  if (s.petLeft > 0) {
    s = { ...s, petLeft: s.petLeft - dt, heartIn: s.heartIn - dt };
    if (s.heartIn <= 0) {
      const dx = (rng() - 0.5) * input.field.size * 0.6;
      s = { ...s, heartIn: s.heartIn + HEART_EVERY_S, emotes: [...s.emotes, { id: s.nextEmoteId, kind: "heart", age: 0, dx }], nextEmoteId: s.nextEmoteId + 1 };
    }
    if (s.petLeft <= 0) {
      return setAnim({ ...s, petLeft: 0, purring: false, nextChoiceIn: randomBetween(rng, IDLE_MIN_S, IDLE_MAX_S) }, "sit");
    }
    return setAnim(s, "tailwag");
  }

  if (s.meowLeft > 0) {
    s = { ...s, meowLeft: s.meowLeft - dt };
    if (s.meowLeft <= 0) return setAnim({ ...s, meowLeft: 0, nextChoiceIn: randomBetween(rng, IDLE_MIN_S, IDLE_MAX_S) }, "sit");
    return setAnim(s, "meow");
  }

  if (still && s.walkTargetX !== null) {
    s = setAnim({ ...s, walkTargetX: null, climbAfterWalk: null }, "sit");
  }

  if (s.walkTargetX !== null) {
    const target = clamp(s.walkTargetX, world.minX, world.maxX);
    const remaining = target - s.x;
    const move = WALK_SPEED_PX_S * dt;
    if (Math.abs(remaining) <= move) {
      const arrived: MumuState = { ...s, x: target, walkTargetX: null, nextChoiceIn: randomBetween(rng, IDLE_MIN_S, IDLE_MAX_S) };
      const side = arrived.climbAfterWalk;
      const ledge = side !== null ? ledgeAbove(input.field, arrived.y) : null;
      if (side !== null && ledge && !still && !input.calm) return startClimb({ ...arrived, climbAfterWalk: null }, side, ledge, input.field);
      return setAnim({ ...arrived, climbAfterWalk: null }, "sit");
    }
    return { ...s, x: s.x + Math.sign(remaining) * move, facing: remaining > 0 ? 1 : -1 };
  }

  s = { ...s, nextChoiceIn: s.nextChoiceIn - dt };
  if (s.nextChoiceIn > 0) return s;

  s = { ...s, nextChoiceIn: randomBetween(rng, IDLE_MIN_S, IDLE_MAX_S) };
  const choice = pickIdleChoice(rng, { calm: input.calm, reducedMotion: still, idleFor: s.idleFor });
  if (choice !== "walk") return setAnim(s, CHOICE_ANIM[choice]);
  const canClimb = !still && !input.calm && ledgeAbove(input.field, s.y) !== null;
  return startWalk(s, world, rng, canClimb ? climbableEdges(world, input.field) : [], input.field);
}

function stepFalling(s: MumuState, input: EngineInput, dt: number, rng: Rng): MumuState {
  const vy = s.vy + GRAVITY_PX_S2 * dt;
  const y = s.y + vy * dt;
  if (y < input.world.floorY) return { ...s, vy, y };
  return setAnim(
    { ...s, mode: "ground", vy: 0, y: input.world.floorY, x: clamp(s.x, input.world.minX, input.world.maxX), nextChoiceIn: randomBetween(rng, IDLE_MIN_S, IDLE_MAX_S) },
    "sit",
  );
}

function stepHanging(s: MumuState, dt: number): MumuState {
  const hangLeft = s.hangLeft - dt;
  return hangLeft > 0 ? { ...s, hangLeft } : startFall({ ...s, hangLeft: 0 });
}

function stepClimbing(s: MumuState, input: EngineInput, dt: number, rng: Rng): MumuState {
  const ledge = s.climbLedge;
  if (!ledge) return startFall(s); // cannot happen via startClimb; fail safe, not silent: the cat drops
  const y = s.y - CLIMB_SPEED_PX_S * dt;
  if (y > s.climbTargetY) return { ...s, y };
  return startHang({ ...s, y: s.climbTargetY }, ledge, input.field, rng);
}

export function step(state: MumuState, input: EngineInput, dt: number, rng: Rng): MumuState {
  const prevX = state.x;
  let s: MumuState = {
    ...state,
    effects: [],
    time: state.time + dt,
    animTime: state.animTime + dt,
    idleFor: input.interacted || (input.actions?.length ?? 0) > 0 ? 0 : state.idleFor + dt,
  };
  s = stepEmotes(s, dt);
  s = applyActions(s, input, rng);

  switch (s.mode) {
    case "held": {
      if (dt > 0) {
        const raw = (s.x - prevX) / dt;
        s = { ...s, dragVx: s.dragVx + (raw - s.dragVx) * Math.min(1, dt * DRAG_VELOCITY_SMOOTHING) };
      }
      break;
    }
    case "falling":
      s = stepFalling(s, input, dt, rng);
      break;
    case "hanging":
      s = stepHanging(s, dt);
      break;
    case "climbing":
      s = stepClimbing(s, input, dt, rng);
      break;
    case "ground":
      s = stepGround(s, input, dt, rng);
      break;
  }
  return stepSwing(s, dt);
}
