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

/** The reader corners Mumu can sit in: the bottom of the screen, left or right. */
export type ParkCorner = "left" | "right";
export const DEFAULT_PARK_CORNER: ParkCorner = "right";

/** The corner a drag ended in: the half of the screen it was dropped on. */
export function cornerForDrop(x: number, viewportWidth: number): ParkCorner {
  return x < viewportWidth / 2 ? "left" : "right";
}

/**
 * The world for a screen (F8):
 * - home: the `data-mumu-floor` element (desk); with none, the bottom of the screen above any nav.
 * - other: the bottom of the screen just above the `data-mumu-avoid` element (bottom nav).
 * - reader: the bottom of the screen; `parkX` is the chosen bottom corner (default right), where Mumu sits.
 */
export function worldForScreen(opts: {
  screen: WorldScreen;
  floor: RectLike | null;
  avoid: RectLike | null;
  viewport: { width: number; height: number };
  scale: number;
  corner?: ParkCorner;
}): { world: World; parkX: number | null } {
  const { screen, floor, avoid, viewport, scale, corner = DEFAULT_PARK_CORNER } = opts;
  const bottom = avoid ? avoid.top : viewport.height;
  if (screen === "home" && floor) return { world: worldFromFloor(floor, viewport, scale), parkX: null };
  if (screen === "reader") {
    const world = worldFromFloor({ left: READER_PARK_MARGIN_PX, right: viewport.width - READER_PARK_MARGIN_PX, top: viewport.height }, viewport, scale);
    return { world, parkX: corner === "left" ? world.minX : world.maxX };
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

// ---- C2: the parts of the screen Mumu can be dragged around ----

export interface Ledge {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Everything the engine needs beyond the floor: sprite size, the screen box and the ledges (shelf planks) to hang from. */
export interface Playfield {
  /** Sprite size in px (FRAME_SIZE * scale). */
  size: number;
  /** The screen (viewport) box. */
  bounds: { left: number; right: number; top: number; bottom: number };
  ledges: Ledge[];
}

/** Rects of `[data-mumu-ledge]` elements, clipped to the viewport; ones that are off-screen or too narrow to hang from are dropped. */
export function playfieldFor(opts: { viewport: { width: number; height: number }; scale: number; ledgeRects: Ledge[] }): Playfield {
  const { viewport, scale } = opts;
  const size = FRAME_SIZE * scale;
  const ledges = opts.ledgeRects
    .map((r) => ({ left: Math.max(0, r.left), right: Math.min(viewport.width, r.right), top: r.top, bottom: r.bottom }))
    .filter((r) => r.right - r.left >= size && r.bottom > 0 && r.top < viewport.height);
  return { size, bounds: { left: 0, right: viewport.width, top: 0, bottom: viewport.height }, ledges };
}
