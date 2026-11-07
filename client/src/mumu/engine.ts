// Mumu's behaviour engine: pure (state + input + dt -> state), no DOM, no timers, no Math.random.
// C1: idle life and walking on the floor. C2: drag (swing), drop (gravity), hang, climb, pet, tap.
// One-shot outputs (sounds, "show the read time") are listed in `state.effects`, rebuilt on every step.
import {
  ALARM_MEOW_EVERY_S,
  CALM_CHOICES,
  CHOICE_ANIM,
  CLIMB_AFTER_IDLE_S,
  CLIMB_SPEED_AT_X3_PX_S,
  DRAG_VELOCITY_SMOOTHING,
  EDGE_CATCH_PX,
  EDGE_WALK_CHANCE,
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
import { FRAME_SIZE, type AnimName } from "./sprites.ts";

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

export type MumuSoundName = "mrrp" | "meow1" | "meow2" | "meow3";
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
  /** 1 = facing right (art direction), -1 = mirrored. Not used for the climb (back view, never mirrored). */
  facing: 1 | -1;
  /** Seconds until the next idle choice. */
  nextChoiceIn: number;
  /** Seconds since the last user interaction (gates yarn and the climb). */
  idleFor: number;
  /** Where a walk is heading, or null when not walking. */
  walkTargetX: number | null;

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
  /** Climbing: the feet y to reach, the ledge it belongs to, and which screen edge is being climbed. */
  climbTargetY: number;
  climbLedge: Ledge | null;
  climbSide: -1 | 1 | null;

  lastTapAt: number | null;
  /** Seconds of petting left; > 0 means being petted. */
  petLeft: number;
  heartIn: number;
  /** True while the purr should be playing. */
  purring: boolean;
  /** Seconds left of the tap-reply meow. */
  meowLeft: number;

  /** The long-reading alarm is up: Mumu is at bottom-centre meowing. */
  alarmOn: boolean;
  /** Seconds until the next alarm meow, and how many have been made (rotates meow1-3). */
  alarmMeowIn: number;
  alarmMeows: number;

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
  /** The long-reading alarm is ringing (from the reading timer). Overrides parking, petting and taps. */
  alarm?: boolean;
}

function randomBetween(rng: Rng, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** Climb speed in px/s for a sprite of `size` px: 40 px/s at x3, scaled with the sprite so it looks the same at x2. */
export function climbSpeed(size: number): number {
  return (CLIMB_SPEED_AT_X3_PX_S * (size / FRAME_SIZE)) / 3;
}

/**
 * Weighted idle choice (F8). Yarn needs `idleFor >= YARN_AFTER_IDLE_S`; "go climb" needs `canClimb` (Home, a ledge above,
 * a screen edge to reach) and `idleFor >= CLIMB_AFTER_IDLE_S`; calm and reduced motion narrow the set.
 */
export function pickIdleChoice(rng: Rng, opts: { calm: boolean; reducedMotion: boolean; idleFor: number; canClimb?: boolean }): IdleChoice {
  let pool = Object.keys(IDLE_WEIGHTS) as IdleChoice[];
  if (opts.reducedMotion) pool = pool.filter((c) => REDUCED_MOTION_CHOICES.includes(c));
  else if (opts.calm) pool = pool.filter((c) => CALM_CHOICES.includes(c));
  if (opts.idleFor < YARN_AFTER_IDLE_S) pool = pool.filter((c) => c !== "yarn");
  if (!opts.canClimb || opts.idleFor < CLIMB_AFTER_IDLE_S) pool = pool.filter((c) => c !== "climb");
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
    mode: "ground",
    time: 0,
    vy: 0,
    dragVx: 0,
    rotation: 0,
    angVel: 0,
    hangLeft: 0,
    climbTargetY: 0,
    climbLedge: null,
    climbSide: null,
    lastTapAt: null,
    petLeft: 0,
    heartIn: 0,
    purring: false,
    meowLeft: 0,
    alarmOn: false,
    alarmMeowIn: 0,
    alarmMeows: 0,
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

/** Screen edges (-1 left, 1 right) that Mumu's floor reaches, so it can walk into them. */
function reachableEdges(world: World, field: Playfield): Array<-1 | 1> {
  const half = field.size / 2;
  const edges: Array<-1 | 1> = [];
  if (world.minX - (field.bounds.left + half) <= EDGE_CATCH_PX) edges.push(-1);
  if (field.bounds.right - half - world.maxX <= EDGE_CATCH_PX) edges.push(1);
  return edges;
}

/** The screen edge the feet are standing at the end of the floor of, if any. */
function edgeSideAt(x: number, world: World, field: Playfield): -1 | 1 | null {
  const edges = reachableEdges(world, field);
  if (edges.includes(-1) && x <= world.minX + 1) return -1;
  if (edges.includes(1) && x >= world.maxX - 1) return 1;
  return null;
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

/** Feet x of a cat flush against a screen edge (the sprite box touches the edge). */
function edgeX(field: Playfield, side: -1 | 1): number {
  const half = field.size / 2;
  return side === -1 ? field.bounds.left + half : field.bounds.right - half;
}

// ---- transitions ----

function startWalkTo(s: MumuState, target: number): MumuState {
  return { ...setAnim(s, "walk"), walkTargetX: target, facing: target > s.x ? 1 : -1 };
}

/** Walk (back) away from a screen edge, at least WALK_MIN_DISTANCE_PX; sits facing away when there is no room. */
function turnAround(s: MumuState, side: -1 | 1, world: World, rng: Rng): MumuState {
  const dir = -side as -1 | 1;
  const turned: MumuState = { ...s, facing: dir };
  const span = dir === 1 ? world.maxX - (s.x + WALK_MIN_DISTANCE_PX) : s.x - WALK_MIN_DISTANCE_PX - world.minX;
  if (span < 0) return setAnim(turned, "sit");
  return startWalkTo(turned, s.x + dir * (WALK_MIN_DISTANCE_PX + rng() * span));
}

/**
 * A walk that ends against a screen edge: climb it when something is above to climb to, otherwise just turn around.
 * Never climbs on other tabs, in the reader, or with reduced motion.
 */
function arriveAtEdge(s: MumuState, side: -1 | 1, input: EngineInput, rng: Rng): MumuState {
  const { world, field } = input;
  const mayClimb = !input.calm && !input.reducedMotion && input.parkAt == null;
  const ledge = mayClimb ? ledgeAbove(field, s.y) : null;
  if (ledge) return startClimb(s, side, ledge, field);
  return turnAround(s, side, world, rng);
}

function startWalk(state: MumuState, world: World, rng: Rng, edges: Array<-1 | 1> = []): MumuState {
  // Sometimes the walk heads for a screen edge: climb it on arrival, or turn around if there is nothing above.
  if (edges.length > 0 && rng() < EDGE_WALK_CHANCE) {
    const side = edges[Math.floor(rng() * edges.length)]!;
    const target = side === -1 ? world.minX : world.maxX;
    if (Math.abs(target - state.x) >= 1) return startWalkTo(state, target);
  }
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

/**
 * The "go climb" idle choice: walk to the nearer screen edge (and climb it on arrival). Also used by MumuLab's button.
 * Needs a reachable edge; with none it just sits.
 */
export function startClimbWalk(state: MumuState, input: EngineInput, rng: Rng): MumuState {
  const { world, field } = input;
  const edges = reachableEdges(world, field);
  if (edges.length === 0) return setAnim({ ...state, walkTargetX: null }, "sit");
  const edgeTarget = (side: -1 | 1) => (side === -1 ? world.minX : world.maxX);
  const side = edges.reduce((best, e) => (Math.abs(edgeTarget(e) - state.x) < Math.abs(edgeTarget(best) - state.x) ? e : best));
  if (Math.abs(edgeTarget(side) - state.x) < 1) return arriveAtEdge({ ...state, x: edgeTarget(side) }, side, input, rng);
  return startWalkTo(state, edgeTarget(side));
}

/** Switch to an animation now (MumuLab buttons; later: scene reactions). Holds it for a normal idle interval. */
export function forceAnim(state: MumuState, anim: AnimName, world: World, rng: Rng): MumuState {
  const held: MumuState = {
    ...state,
    mode: "ground",
    walkTargetX: null,
    petLeft: 0,
    purring: false,
    meowLeft: 0,
    vy: 0,
    climbSide: null,
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
      climbSide: null,
      walkTargetX: null,
    },
    "hang",
  );
}

function startClimb(s: MumuState, side: -1 | 1, ledge: Ledge, field: Playfield): MumuState {
  return setAnim(
    {
      ...s,
      mode: "climbing",
      x: edgeX(field, side), // flush against the edge
      facing: side,
      climbLedge: ledge,
      climbTargetY: hangFeetY(ledge, field.size),
      climbSide: side,
      walkTargetX: null,
      vy: 0,
    },
    "climb",
  );
}

function startFall(s: MumuState): MumuState {
  return setAnim({ ...s, mode: "falling", vy: 0, walkTargetX: null, climbSide: null }, "held");
}

function startPet(s: MumuState): MumuState {
  return setAnim({ ...s, petLeft: PET_DURATION_S, heartIn: 0, purring: true, meowLeft: 0, walkTargetX: null }, "tailwag");
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
              petLeft: 0,
              purring: false,
              meowLeft: 0,
              hangLeft: 0,
              climbLedge: null,
              climbSide: null,
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
        if (s.mode === "held" || s.alarmOn) break; // the alarm bubble is the only thing Mumu says now
        if (s.mode === "ground" && s.lastTapAt !== null && s.time - s.lastTapAt <= PET_TAP_WINDOW_S) {
          s = { ...startPet(s), lastTapAt: s.time };
        } else if (s.mode === "ground" && s.petLeft > 0) {
          s = { ...s, petLeft: PET_DURATION_S, lastTapAt: s.time };
        } else {
          const reply = s.mode === "ground" ? { ...setAnim(s, "meow"), meowLeft: TAP_MEOW_S, walkTargetX: null } : s;
          s = { ...reply, lastTapAt: s.time, effects: [...s.effects, { type: "readTime" }, { type: "sound", name: "mrrp" }] };
        }
        break;
      case "stroke":
        if (s.mode !== "ground" || s.alarmOn) break;
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

/** The alarm: starts when `input.alarm` goes up (clearing petting and walks), meows every ALARM_MEOW_EVERY_S, ends when it drops. */
function stepAlarm(s: MumuState, input: EngineInput, dt: number, rng: Rng): MumuState {
  if (!input.alarm) {
    if (!s.alarmOn) return s;
    const ended = { ...s, alarmOn: false, nextChoiceIn: randomBetween(rng, IDLE_MIN_S, IDLE_MAX_S) };
    return s.mode === "ground" ? setAnim(ended, "sit") : ended;
  }
  let a = s;
  if (!a.alarmOn) a = { ...a, alarmOn: true, alarmMeowIn: 0, alarmMeows: 0, petLeft: 0, purring: false, meowLeft: 0, walkTargetX: null };
  const alarmMeowIn = a.alarmMeowIn - dt;
  if (alarmMeowIn > 0) return { ...a, alarmMeowIn };
  const name = `meow${(a.alarmMeows % 3) + 1}` as MumuSoundName;
  return { ...a, alarmMeowIn: alarmMeowIn + ALARM_MEOW_EVERY_S, alarmMeows: a.alarmMeows + 1, effects: [...a.effects, { type: "sound", name }] };
}

function stepEmotes(s: MumuState, dt: number): MumuState {
  return { ...s, emotes: s.emotes.map((e) => ({ ...e, age: e.age + dt })).filter((e) => e.age < EMOTE_LIFE_S) };
}

function stepGround(state: MumuState, input: EngineInput, dt: number, rng: Rng): MumuState {
  const { world, field } = input;
  const parked = input.parkAt != null && !state.alarmOn; // the alarm pulls Mumu out of its corner
  // Reduced motion and reader parking both mean: stay put, sit/loaf only.
  const still = input.reducedMotion || parked;
  let s: MumuState = {
    ...state,
    y: world.floorY,
    x: clamp(parked ? input.parkAt! : state.x, world.minX, world.maxX),
    facing: parked ? -1 : state.facing, // the reader corner is on the right: look into the page
  };

  if (s.alarmOn) {
    // Walk to bottom-centre (reduced motion: no walking, it is just there) and sit there meowing.
    const target = clamp((field.bounds.left + field.bounds.right) / 2, world.minX, world.maxX);
    const move = WALK_SPEED_PX_S * dt;
    if (input.reducedMotion || Math.abs(target - s.x) <= move) return setAnim({ ...s, x: target, walkTargetX: null }, "meow");
    const dir = target > s.x ? 1 : -1;
    return { ...setAnim(s, "walk"), walkTargetX: null, x: s.x + dir * move, facing: dir };
  }

  if (s.petLeft > 0) {
    s = { ...s, petLeft: s.petLeft - dt, heartIn: s.heartIn - dt };
    if (s.heartIn <= 0) {
      const dx = (rng() - 0.5) * field.size * 0.6;
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
    s = setAnim({ ...s, walkTargetX: null }, "sit");
  }

  if (s.walkTargetX !== null) {
    const target = clamp(s.walkTargetX, world.minX, world.maxX);
    const remaining = target - s.x;
    const move = WALK_SPEED_PX_S * dt;
    if (Math.abs(remaining) <= move) {
      const arrived: MumuState = { ...s, x: target, walkTargetX: null, nextChoiceIn: randomBetween(rng, IDLE_MIN_S, IDLE_MAX_S) };
      const side = edgeSideAt(arrived.x, world, field);
      return side === null ? setAnim(arrived, "sit") : arriveAtEdge(arrived, side, input, rng);
    }
    return { ...s, x: s.x + Math.sign(remaining) * move, facing: remaining > 0 ? 1 : -1 };
  }

  s = { ...s, nextChoiceIn: s.nextChoiceIn - dt };
  if (s.nextChoiceIn > 0) return s;

  s = { ...s, nextChoiceIn: randomBetween(rng, IDLE_MIN_S, IDLE_MAX_S) };
  const edges = reachableEdges(world, field);
  const canClimb = !still && !input.calm && edges.length > 0 && ledgeAbove(field, s.y) !== null;
  const choice = pickIdleChoice(rng, { calm: input.calm, reducedMotion: still, idleFor: s.idleFor, canClimb });
  if (choice === "climb") return startClimbWalk(s, input, rng);
  if (choice !== "walk") return setAnim(s, CHOICE_ANIM[choice]);
  return startWalk(s, world, rng, still ? [] : edges);
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
  const { field } = input;
  const ledge = s.climbLedge;
  const side = s.climbSide;
  if (!ledge || side === null) return startFall(s); // cannot happen via startClimb; fail safe, not silent: the cat drops
  const flush = { ...s, x: edgeX(field, side) }; // stays flush against the edge, even if the window is resized
  const y = s.y - climbSpeed(field.size) * dt;
  if (y > s.climbTargetY) return { ...flush, y };
  return startHang({ ...flush, y: s.climbTargetY }, ledge, field, rng); // front-view hang strip from here on
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
  s = stepAlarm(s, input, dt, rng);
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
