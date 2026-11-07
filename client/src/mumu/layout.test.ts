import { describe, expect, it } from "vitest";
import { mumuScale, READER_PARK_MARGIN_PX, worldForScreen, worldFromFloor } from "./layout.ts";
import { ANIM_NAMES, frameAt, SPRITES } from "./sprites.ts";

describe("mumuScale", () => {
  it("is x3 from 768 px wide and x2 below, always an integer", () => {
    expect(mumuScale(767)).toBe(2);
    expect(mumuScale(768)).toBe(3);
    expect(mumuScale(390)).toBe(2);
    expect(mumuScale(1440)).toBe(3);
  });
});

describe("worldFromFloor", () => {
  const viewport = { width: 400, height: 800 };
  it("keeps the feet centre half a sprite inside the floor", () => {
    // scale 2 -> sprite 64 px -> 32 px margin
    expect(worldFromFloor({ left: 50, right: 350, top: 500 }, viewport, 2)).toEqual({ minX: 82, maxX: 318, floorY: 500 });
  });
  it("uses the viewport bottom when there is no floor element", () => {
    expect(worldFromFloor(null, viewport, 2)).toEqual({ minX: 32, maxX: 368, floorY: 800 });
  });
  it("never returns maxX < minX for a floor narrower than the sprite", () => {
    const w = worldFromFloor({ left: 100, right: 120, top: 10 }, viewport, 3);
    expect(w.maxX).toBeGreaterThanOrEqual(w.minX);
  });
});

describe("worldForScreen", () => {
  const viewport = { width: 400, height: 800 };
  const desk = { left: 20, right: 380, top: 500 };
  const nav = { left: 0, right: 400, top: 750 };

  it("home with a desk walks on the desk", () => {
    const { world, parkX } = worldForScreen({ screen: "home", floor: desk, avoid: nav, viewport, scale: 2 });
    expect(world).toEqual({ minX: 52, maxX: 348, floorY: 500 });
    expect(parkX).toBeNull();
  });

  it("home without a desk still keeps Mumu on screen, above the nav", () => {
    const { world } = worldForScreen({ screen: "home", floor: null, avoid: nav, viewport, scale: 2 });
    expect(world.floorY).toBe(750);
    expect(world.minX).toBe(32);
    expect(world.maxX).toBe(368);
  });

  it("other tabs use the strip just above the bottom nav, ignoring any desk", () => {
    const { world, parkX } = worldForScreen({ screen: "other", floor: desk, avoid: nav, viewport, scale: 2 });
    expect(world.floorY).toBe(750);
    expect(parkX).toBeNull();
  });

  it("other tabs without a nav use the screen bottom", () => {
    expect(worldForScreen({ screen: "other", floor: null, avoid: null, viewport, scale: 2 }).world.floorY).toBe(800);
  });

  it("the reader parks in the bottom-right corner on the screen bottom", () => {
    const { world, parkX } = worldForScreen({ screen: "reader", floor: desk, avoid: nav, viewport, scale: 2 });
    expect(world.floorY).toBe(800);
    expect(parkX).toBe(world.maxX);
    // sprite (64 px) ends READER_PARK_MARGIN_PX from the right edge
    expect(parkX! + 32).toBe(400 - READER_PARK_MARGIN_PX);
  });
});

describe("sprite manifest", () => {
  it("has every animation with positive frames and fps", () => {
    for (const name of ANIM_NAMES) {
      expect(SPRITES[name].frames).toBeGreaterThan(0);
      expect(SPRITES[name].fps).toBeGreaterThan(0);
    }
  });
  it("loops frames by time", () => {
    const walk = SPRITES.walk; // 6 frames @ 10 fps
    expect(frameAt(walk, 0)).toBe(0);
    expect(frameAt(walk, 0.15)).toBe(1);
    expect(frameAt(walk, 0.6)).toBe(0);
  });
  it("clamps a non-looping animation to its last frame", () => {
    expect(frameAt({ frames: 3, fps: 4, loop: false }, 10)).toBe(2);
  });
});
