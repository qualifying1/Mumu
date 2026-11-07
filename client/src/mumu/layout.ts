// Pure geometry helpers: sprite scale and the walkable world from the floor element's rect.
import { SCALE_NARROW, SCALE_WIDE, WIDE_BREAKPOINT_PX } from "./constants.ts";
import { FRAME_SIZE } from "./sprites.ts";

export interface RectLike {
  left: number;
  right: number;
  top: number;
}

/** Where Mumu's feet may be: x range of the feet centre, and the y of the floor surface. */
export interface World {
  minX: number;
  maxX: number;
  floorY: number;
}

export function mumuScale(viewportWidth: number): number {
  return viewportWidth >= WIDE_BREAKPOINT_PX ? SCALE_WIDE : SCALE_NARROW;
}

/**
 * Walkable range on a floor rect. Feet-centre x stays half a sprite inside the floor so the
 * sprite never hangs off the ends. Without a floor element: the whole viewport bottom.
 */
export function worldFromFloor(floor: RectLike | null, viewport: { width: number; height: number }, scale: number): World {
  const half = (FRAME_SIZE * scale) / 2;
  const rect = floor ?? { left: 0, right: viewport.width, top: viewport.height };
  const minX = rect.left + half;
  const maxX = Math.max(minX, rect.right - half);
  return { minX, maxX, floorY: rect.top };
}
