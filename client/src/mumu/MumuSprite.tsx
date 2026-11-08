// Thin renderer: draws one frame of a horizontal strip at an integer scale, pixelated, mirrored when facing left.
// Positioning is by feet: (x, floorY) is the bottom centre of the sprite.
import type { CSSProperties, HTMLAttributes } from "react";
import { FRAME_SIZE, SPRITES, frameAt, frameHeight, isMirrored, spriteUrl, type AnimName } from "./sprites.ts";

export interface MumuSpriteProps extends Omit<HTMLAttributes<HTMLDivElement>, "style"> {
  anim: AnimName;
  animTime: number;
  facing: 1 | -1;
  scale: number;
  /** Feet centre x in viewport px. */
  x: number;
  /** Feet y in viewport px. */
  floorY: number;
  /** Extra rotation in degrees about the top centre (the swing). */
  rotationDeg?: number;
  /** Only Mumu's own element takes pointer events (rule: never block scrolling). */
  interactive?: boolean;
  /** Shown as the cursor while interactive. */
  cursor?: "grab" | "grabbing";
}

export default function MumuSprite({ anim, animTime, facing, scale, x, floorY, rotationDeg = 0, interactive = false, cursor = "grab", ...handlers }: MumuSpriteProps) {
  if (!Number.isInteger(scale) || scale < 1) throw new Error(`Mumu scale must be a positive integer, got ${scale}`);
  const def = SPRITES[anim];
  const frame = frameAt(def, animTime);
  const size = FRAME_SIZE * scale;
  const height = frameHeight(def) * scale;
  const mirrored = isMirrored(anim, facing);
  const style: CSSProperties = {
    position: "fixed",
    zIndex: 50,
    left: Math.round(x - size / 2),
    top: Math.round(floorY - height),
    width: size,
    height,
    backgroundImage: `url(${spriteUrl(anim)})`,
    backgroundSize: `${def.frames * size}px ${height}px`,
    backgroundPosition: `${-frame * size}px 0`,
    backgroundRepeat: "no-repeat",
    imageRendering: "pixelated",
    transform: `${mirrored ? "scaleX(-1) " : ""}rotate(${mirrored ? -rotationDeg : rotationDeg}deg)`,
    transformOrigin: "50% 0",
    pointerEvents: interactive ? "auto" : "none",
    touchAction: "none",
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
    cursor: interactive ? cursor : undefined,
  };
  return <div data-mumu-sprite={anim} data-mumu-frame={frame} style={style} {...handlers} />;
}
