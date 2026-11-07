// Draws Mumu and everything attached to it (hearts, the speech bubble) and wires up its pointer handling.
// Used by the app-wide MumuLayer and by MumuLab. The layer around it is `pointer-events: none`;
// only the sprite element takes pointer events (rule: Mumu never blocks scrolling).
import type { CSSProperties } from "react";
import { EMOTE_LIFE_S } from "./constants.ts";
import MumuSprite from "./MumuSprite.tsx";
import { usePointerGestures } from "./usePointerGestures.ts";
import type { useMumuEngine } from "./useMumuEngine.ts";

const EMOTE_SIZE = 16;
const EMOTE_RISE_PX = 28;

type Engine = ReturnType<typeof useMumuEngine>;

function emoteUrl(name: string): string {
  return `${import.meta.env.BASE_URL}mumu/emotes/${name}.png`;
}

export default function MumuStage({ engine }: { engine: Engine }) {
  const { state, scale, field, bubble, dispatch } = engine;
  const handlers = usePointerGestures(dispatch);
  const size = field.size;
  const top = state.y - size;

  const bubbleStyle: CSSProperties = {
    position: "fixed",
    zIndex: 51,
    left: Math.round(Math.min(Math.max(state.x, 90), Math.max(90, window.innerWidth - 90))),
    top: Math.round(Math.max(8, top - 8)),
    transform: "translate(-50%, -100%)",
    maxWidth: 180,
    padding: "6px 10px",
    background: "Canvas",
    color: "CanvasText",
    border: "2px solid CanvasText",
    boxShadow: "0 3px 0 CanvasText",
    fontSize: 12,
    lineHeight: 1.3,
    textAlign: "center",
    pointerEvents: "none",
  };

  return (
    <>
      <MumuSprite
        anim={state.anim}
        animTime={state.animTime}
        facing={state.facing}
        scale={scale}
        x={state.x}
        floorY={state.y}
        rotationDeg={state.rotation}
        interactive
        cursor={state.mode === "held" ? "grabbing" : "grab"}
        {...handlers}
      />
      {state.emotes.map((e) => {
        const t = e.age / EMOTE_LIFE_S;
        const px = EMOTE_SIZE * scale;
        const style: CSSProperties = {
          position: "fixed",
          zIndex: 52,
          left: Math.round(state.x + e.dx - px / 2),
          top: Math.round(top - px * 0.4 - t * EMOTE_RISE_PX * scale),
          width: px,
          height: px,
          imageRendering: "pixelated",
          opacity: t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4,
          pointerEvents: "none",
        };
        return <img key={e.id} src={emoteUrl(e.kind)} alt="" draggable={false} data-mumu-emote={e.kind} style={style} />;
      })}
      {bubble && (
        <div key={bubble.id} role="status" data-mumu-bubble style={bubbleStyle}>
          {bubble.text}
        </div>
      )}
    </>
  );
}
