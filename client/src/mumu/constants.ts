// Behaviour numbers from docs/SPEC.md F8, in one place.
import type { AnimName } from "./sprites.ts";

/** Idle life: a new choice every IDLE_MIN_S..IDLE_MAX_S seconds. */
export const IDLE_MIN_S = 4;
export const IDLE_MAX_S = 10;

/** Yarn only after this long without any interaction. */
export const YARN_AFTER_IDLE_S = 20;

export type IdleChoice = "walk" | "sit" | "loaf" | "tailwag" | "yarn";

/** Weights from F8 (30 / 20 / 20 / 15 / 15). */
export const IDLE_WEIGHTS: Record<IdleChoice, number> = {
  walk: 30,
  sit: 20,
  loaf: 20,
  tailwag: 15,
  yarn: 15,
};

/** Calm idle life on other tabs and under reduced motion. */
export const CALM_CHOICES: readonly IdleChoice[] = ["walk", "sit", "loaf"];
export const REDUCED_MOTION_CHOICES: readonly IdleChoice[] = ["sit", "loaf"];

/** Walking speed in CSS px per second (screen space, independent of sprite scale). */
export const WALK_SPEED_PX_S = 48;
/** A walk target is at least this far away, so Mumu visibly walks. */
export const WALK_MIN_DISTANCE_PX = 60;

/** Scale: x3 at >= 768 px wide, x2 below (F8). */
export const WIDE_BREAKPOINT_PX = 768;
export const SCALE_WIDE = 3;
export const SCALE_NARROW = 2;

export const CHOICE_ANIM: Record<Exclude<IdleChoice, "walk">, AnimName> = {
  sit: "sit",
  loaf: "loaf",
  tailwag: "tailwag",
  yarn: "yarn",
};
