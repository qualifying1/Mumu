// Behaviour numbers from docs/SPEC.md F8, in one place.
import type { AnimName } from "./sprites.ts";

/** Idle life: a new choice every IDLE_MIN_S..IDLE_MAX_S seconds. */
export const IDLE_MIN_S = 4;
export const IDLE_MAX_S = 10;

/** Yarn only after this long without any interaction. */
export const YARN_AFTER_IDLE_S = 20;

export type IdleChoice = "walk" | "sit" | "loaf" | "tailwag" | "yarn" | "climb";

/** Weights from F8 (30 / 20 / 20 / 15 / 15), plus "go climb" at 15 (Home only, after CLIMB_AFTER_IDLE_S idle). */
export const IDLE_WEIGHTS: Record<IdleChoice, number> = {
  walk: 30,
  sit: 20,
  loaf: 20,
  tailwag: 15,
  yarn: 15,
  climb: 15,
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

export const CHOICE_ANIM: Record<Exclude<IdleChoice, "walk" | "climb">, AnimName> = {
  sit: "sit",
  loaf: "loaf",
  tailwag: "tailwag",
  yarn: "yarn",
};

// ---- C2: drag, swing, drop, hang, climb, pet, tap (SPEC F8) ----

/** Press and move more than this to pick Mumu up; less is a tap. */
export const DRAG_THRESHOLD_PX = 8;

/** Swing: rotation = clamp(horizontal velocity * SWING_DEG_PER_PX_S, +-SWING_MAX_DEG), spring back. */
export const SWING_DEG_PER_PX_S = 0.05;
export const SWING_MAX_DEG = 25;
export const SWING_SPRING = 120; // 1 / s^2
export const SWING_DAMPING = 10; // 1 / s
/** How quickly the measured drag velocity follows the raw one (1 / s). */
export const DRAG_VELOCITY_SMOOTHING = 12;

/** Gravity in px / s^2 (screen space). */
export const GRAVITY_PX_S2 = 2400;

/** Released with the sprite top within this distance below a ledge: hang. */
export const HANG_CATCH_PX = 24;
export const HANG_MIN_S = 3;
export const HANG_MAX_S = 6;

/** Released with the feet centre this close to a side edge of the screen: climb. */
export const EDGE_CATCH_PX = 24;
/** Climb speed at x3 in px/s; it scales with the sprite scale (x2 climbs at 2/3 of this) so it looks the same. */
export const CLIMB_SPEED_AT_X3_PX_S = 40;
/** A walk that is started has this chance to head for a screen edge: climb it, or turn around if nothing is above. */
export const EDGE_WALK_CHANCE = 0.2;
/** The "go climb" idle choice needs this long without interaction. */
export const CLIMB_AFTER_IDLE_S = 10;

/** Petting: 2+ taps within this window, or a stroke of the cursor across Mumu. */
export const PET_TAP_WINDOW_S = 1.5;
export const PET_DURATION_S = 3;
export const HEART_EVERY_S = 0.35;
export const EMOTE_LIFE_S = 1.1;
/** Stroke: this many direction reversals within the window, each after at least STROKE_MIN_STEP_PX of travel. */
export const STROKE_REVERSALS = 3;
export const STROKE_WINDOW_S = 1.5;
export const STROKE_MIN_STEP_PX = 6;

/** A tap makes Mumu meow (tap reply) for this long. */
export const TAP_MEOW_S = 1.2;
/** How long the read-time speech bubble stays up. */
export const BUBBLE_S = 3.5;

// ---- No teleporting: every move is a walk, climb, jump, fall or a glide to the pointer ----

/** Brisk walk to the reader corner, the alarm spot, or back onto the floor. */
export const HURRY_WALK_SPEED_PX_S = 96;
/** A floor that moves less than this (page scroll) is followed smoothly; a bigger gap is a fall or a jump. */
export const RIDE_PX = 24;
export const RIDE_SPEED_PX_S = 600;
/** Held Mumu glides to the pointer: closing rate in 1 / s (about 100 ms to catch up). */
export const HOLD_FOLLOW_PER_S = 30;
/** Sideways speed to the screen edge while climbing it, and to the plank while being pulled up onto a hang. */
export const CLIMB_SIDESTEP_PX_S = 120;
export const HANG_PULL_PX_S = 240;
/** A jump (used to get up onto a higher floor): flight time and arc height grow with the distance. */
export const JUMP_MIN_S = 0.45;
export const JUMP_MAX_S = 1;
export const JUMP_PX_PER_S = 900;
export const JUMP_HEIGHT_MIN_PX = 40;
export const JUMP_HEIGHT_MAX_PX = 160;
export const JUMP_HEIGHT_FRACTION = 0.25;
/** The alarm climb up the middle of the reading panel: faster than the shelf climb, at x3 in px/s. */
export const ALARM_CLIMB_SPEED_AT_X3_PX_S = 100;
/** Position snapping below this is invisible and stops endless sub-pixel chasing. */
export const ARRIVE_EPS_PX = 0.25;

// ---- C3: reading timer and long-reading alarm (SPEC F8) ----

/** Reading counts only if there was activity within this window. */
export const ACTIVITY_WINDOW_S = 120;
/** `readingLog` is written this often while reading. */
export const LOG_EVERY_S = 15;
/** The continuous session resets after this long outside the reader. */
export const SESSION_RESET_OUTSIDE_S = 300;
/** While the alarm is up, Mumu meows this often, rotating meow1-3. */
export const ALARM_MEOW_EVERY_S = 2.5;
