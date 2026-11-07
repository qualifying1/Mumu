// Thin renderer: draws one frame of a horizontal strip at an integer scale, pixelated, mirrored when facing left.
// Positioning is by feet: (x, floorY) is the bottom centre of the sprite.
import type { CSSProperties } from "react";
import { FRAME_SIZE, SPRITES, frameAt, spriteUrl, type AnimName } from "./sprites.ts";

export interface MumuSpriteProps {
  anim: AnimName;
  animTime: number;
  facing: 1 | -1;
  scale: number;
  x: number;
  floorY: number;
  /** Extra rotation in degrees (the swing in C2). */
  rotationDeg?: number;
  /** Only Mumu's own element takes pointer events (rule: never block scrolling). */
  interactive?: boolean;
}

export default function MumuSprite({ anim, animTime, facing, scale, x, floorY, rotationDeg = 0, interactive = false }: MumuSpriteProps) {
  if (!Number.isInteger(scale) || scale < 1) throw new Error(`Mumu scale must be a positive integer, got ${scale}`);
  const def = SPRITES[anim];
  const frame = frameAt(def, animTime);
  const size = FRAME_SIZE * scale;
  const style: CSSProperties = {
    position: "fixed",
    zIndex: 50,
    left: Math.round(x - size / 2),
    top: Math.round(floorY - size),
    width: size,
    height: size,
    backgroundImage: `url(${spriteUrl(anim)})`,
    backgroundSize: `${def.frames * size}px ${size}px`,
    backgroundPosition: `${-frame * size}px 0`,
    backgroundRepeat: "no-repeat",
    imageRendering: "pixelated",
    transform: `${facing === -1 ? "scaleX(-1) " : ""}rotate(${facing === -1 ? -rotationDeg : rotationDeg}deg)`,
    transformOrigin: "50% 0",
    pointerEvents: interactive ? "auto" : "none",
    touchAction: "none",
  };
  return <div data-mumu-sprite={anim} data-mumu-frame={frame} style={style} />;
}
