// The one sprite manifest (docs/ASSETS.md §1): frame size, frames, fps and loop per animation.
// Swapping art changes only PNG files in client/public/mumu/ and the numbers here.
export interface SpriteAnim {
  /** Number of frames in the horizontal strip */
  frames: number;
  fps: number;
  loop: boolean;
}

export const FRAME_SIZE = 32;

export const ANIM_NAMES = ["walk", "sit", "tailwag", "loaf", "yarn", "climb", "hang", "held", "meow"] as const;
export type AnimName = (typeof ANIM_NAMES)[number];

// Frame counts are the middle of the ranges in ASSETS.md; fps and loop are fixed by the table.
export const SPRITES: Record<AnimName, SpriteAnim> = {
  walk: { frames: 6, fps: 10, loop: true },
  sit: { frames: 3, fps: 4, loop: true },
  tailwag: { frames: 4, fps: 8, loop: true },
  loaf: { frames: 3, fps: 3, loop: true },
  yarn: { frames: 6, fps: 8, loop: true },
  climb: { frames: 5, fps: 8, loop: true }, // back view, never mirrored (see isMirrored)
  hang: { frames: 3, fps: 4, loop: true },
  held: { frames: 2, fps: 4, loop: true },
  meow: { frames: 3, fps: 6, loop: true },
};

/** Left-facing is the mirrored right-facing art, except the climb: it is a back view, the same on both edges. */
export function isMirrored(anim: AnimName, facing: 1 | -1): boolean {
  return anim !== "climb" && facing === -1;
}

export function spriteUrl(name: AnimName): string {
  return `${import.meta.env.BASE_URL}mumu/${name}.png`;
}

/** Frame index to draw after `elapsedS` seconds in an animation. */
export function frameAt(anim: SpriteAnim, elapsedS: number): number {
  const raw = Math.floor(elapsedS * anim.fps);
  return anim.loop ? raw % anim.frames : Math.min(raw, anim.frames - 1);
}
