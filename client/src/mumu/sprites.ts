// The one sprite manifest (docs/ASSETS.md §1): frame size, frames, fps and loop per animation.
// M1 ships it empty; Lane C fills it in C1. Swapping art changes only PNG files and this manifest.
export interface SpriteAnim {
  /** Number of frames in the horizontal strip */
  frames: number;
  fps: number;
  loop: boolean;
}

export const FRAME_SIZE = 32;

export const SPRITES: Record<string, SpriteAnim> = {};
