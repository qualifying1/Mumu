import { describe, expect, it } from "vitest";
import { cornerForDrop, mumuScale, playfieldFor, READER_PARK_MARGIN_PX, worldForScreen, worldFromFloor } from "./layout.ts";
import { ANIM_NAMES, FRAME_SIZE, frameAt, frameHeight, HELD_REACH, isMirrored, SPRITES } from "./sprites.ts";

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

  it("the reader can park in the bottom-left corner instead, with the same margin", () => {
    const { world, parkX } = worldForScreen({ screen: "reader", floor: desk, avoid: nav, viewport, scale: 2, corner: "left" });
    expect(parkX).toBe(world.minX);
    expect(parkX! - 32).toBe(READER_PARK_MARGIN_PX);
  });
});

describe("cornerForDrop", () => {
  it("picks the corner on the half of the screen where Mumu was dropped", () => {
    expect(cornerForDrop(50, 400)).toBe("left");
    expect(cornerForDrop(199, 400)).toBe("left");
    expect(cornerForDrop(200, 400)).toBe("right");
    expect(cornerForDrop(380, 400)).toBe("right");
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
    const walk = SPRITES.walk; // 8 frames @ 10 fps
    expect(frameAt(walk, 0)).toBe(0);
    expect(frameAt(walk, 0.15)).toBe(1);
    expect(frameAt(walk, 0.8)).toBe(0);
  });
  it("clamps a non-looping animation to its last frame", () => {
    expect(frameAt({ frames: 3, fps: 4, loop: false }, 10)).toBe(2);
  });
});

describe("held art", () => {
  it("is a taller cell held by the top: its feet hang HELD_REACH sprites below the pointer", () => {
    expect(frameHeight(SPRITES.held)).toBe(48);
    expect(frameHeight(SPRITES.walk)).toBe(FRAME_SIZE);
    expect(HELD_REACH).toBe(1.5);
  });
});

describe("climb art", () => {
  it("is a 5-frame back view at 8 fps that is never mirrored; everything else mirrors when facing left", () => {
    expect(SPRITES.climb).toEqual({ frames: 5, fps: 8, loop: true });
    expect(isMirrored("climb", -1)).toBe(false);
    expect(isMirrored("climb", 1)).toBe(false);
    expect(isMirrored("walk", -1)).toBe(true);
    expect(isMirrored("hang", 1)).toBe(false);
  });
});

describe("playfieldFor", () => {
  const viewport = { width: 400, height: 800 };
  it("has the sprite size and the screen as bounds", () => {
    const f = playfieldFor({ viewport, scale: 2, ledgeRects: [] });
    expect(f.size).toBe(64);
    expect(f.bounds).toEqual({ left: 0, right: 400, top: 0, bottom: 800 });
  });
  it("clips ledges to the screen and drops off-screen or too-narrow ones", () => {
    const f = playfieldFor({
      viewport,
      scale: 2,
      ledgeRects: [
        { left: -300, right: 900, top: 100, bottom: 120 }, // a scrolled shelf wider than the screen
        { left: 10, right: 50, top: 100, bottom: 120 }, // narrower than the 64 px sprite
        { left: 0, right: 400, top: 900, bottom: 920 }, // below the screen
        { left: 0, right: 400, top: -50, bottom: -30 }, // above the screen
      ],
    });
    expect(f.ledges).toEqual([{ left: 0, right: 400, top: 100, bottom: 120 }]);
  });
});
