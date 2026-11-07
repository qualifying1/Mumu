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

/** Gap between Mumu's parked sprite and the screen edge in the reader. */
export const READER_PARK_MARGIN_PX = 8;

export type WorldScreen = "home" | "reader" | "other";

/**
 * The world for a screen (F8):
 * - home: the `data-mumu-floor` element (desk); with none, the bottom of the screen above any nav.
 * - other: the bottom of the screen just above the `data-mumu-avoid` element (bottom nav).
 * - reader: the bottom of the screen; `parkX` is the bottom-right corner, where Mumu sits.
 */
export function worldForScreen(opts: {
  screen: WorldScreen;
  floor: RectLike | null;
  avoid: RectLike | null;
  viewport: { width: number; height: number };
  scale: number;
}): { world: World; parkX: number | null } {
  const { screen, floor, avoid, viewport, scale } = opts;
  const bottom = avoid ? avoid.top : viewport.height;
  if (screen === "home" && floor) return { world: worldFromFloor(floor, viewport, scale), parkX: null };
  if (screen === "reader") {
    const world = worldFromFloor({ left: 0, right: viewport.width - READER_PARK_MARGIN_PX, top: viewport.height }, viewport, scale);
    return { world, parkX: world.maxX };
  }
  return { world: worldFromFloor({ left: 0, right: viewport.width, top: bottom }, viewport, scale), parkX: null };
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
