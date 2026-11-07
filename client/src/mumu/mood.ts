// Scene reactions (SPEC F8): which pose and emote Mumu shows for each mood, and the 4 s debounce on mood changes.
// Pure: no DOM, no timers. The engine owns a MoodWatch in its state and feeds it the bridge mood every step.
import type { Mood } from "@mumu/shared";
import { MOOD_DEBOUNCE_S } from "./constants.ts";
import type { AnimName } from "./sprites.ts";

export type EmoteKind = "heart" | "exclaim" | "question" | "tear" | "sparkle";

export interface Reaction {
  anim: AnimName;
  /** A faster animation (battle: "fast tail wag"). */
  fast: boolean;
  emote: EmoteKind | null;
}

/** F8: calm -> loaf · tense -> sit + ❗ · mystery -> sit + ❓ · battle -> fast tail wag + ❗ · climax -> tail wag + ✨ · romance -> sit + 💗 · sad -> loaf + 💧 · comedic -> yarn. */
export const MOOD_REACTIONS: Record<Mood, Reaction> = {
  calm: { anim: "loaf", fast: false, emote: null },
  tense: { anim: "sit", fast: false, emote: "exclaim" },
  mystery: { anim: "sit", fast: false, emote: "question" },
  battle: { anim: "tailwag", fast: true, emote: "exclaim" },
  climax: { anim: "tailwag", fast: false, emote: "sparkle" },
  romance: { anim: "sit", fast: false, emote: "heart" },
  sad: { anim: "loaf", fast: false, emote: "tear" },
  comedic: { anim: "yarn", fast: false, emote: null },
};

/** What `mood` was last reacted to, and how long until the next reaction may happen. */
export interface MoodWatch {
  applied: Mood | null;
  /** Seconds left of the debounce window; a new mood has to wait for it to reach 0. */
  cooldown: number;
}

export function createMoodWatch(): MoodWatch {
  return { applied: null, cooldown: 0 };
}

/**
 * The debounce, as a throttle with a trailing edge: a mood change reacts at once when the last reaction is at least
 * MOOD_DEBOUNCE_S ago; otherwise the newest mood waits for the window to end and then reacts, unless it flipped back
 * to the mood already shown by then. Scrolling back and forth over a region boundary therefore never makes Mumu flicker,
 * and a fast flick through two regions still ends on the right pose.
 * `null` (not in the reader) clears the pose at once and forgets the mood, so opening the reader again reacts again.
 * `fire` is set on the steps where Mumu should react: `undefined` = nothing to do, `null` = stop reacting, a mood = react.
 */
export function stepMoodWatch(watch: MoodWatch, mood: Mood | null, dt: number): { watch: MoodWatch; fire: Mood | null | undefined } {
  const cooldown = Math.max(0, watch.cooldown - dt);
  if (mood === null) {
    return { watch: { applied: null, cooldown }, fire: watch.applied === null ? undefined : null };
  }
  if (mood === watch.applied) return { watch: { applied: watch.applied, cooldown }, fire: undefined };
  if (cooldown > 0) return { watch: { applied: watch.applied, cooldown }, fire: undefined };
  return { watch: { applied: mood, cooldown: MOOD_DEBOUNCE_S }, fire: mood };
}
