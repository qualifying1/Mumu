// Draws Mumu and everything attached to it (hearts, the speech bubble) and wires up its pointer handling.
// Used by the app-wide MumuLayer and by MumuLab. The layer around it is `pointer-events: none`;
// only the sprite element takes pointer events (rule: Mumu never blocks scrolling).
import type { CSSProperties } from "react";
import MumuSprite from "./MumuSprite.tsx";
import { RECAP_TITLE } from "./recap.ts";
import type { ActiveRecap } from "./useMumuRecap.ts";
import { usePointerGestures } from "./usePointerGestures.ts";
import type { useMumuEngine } from "./useMumuEngine.ts";

const EMOTE_SIZE = 16;
const EMOTE_RISE_PX = 28;

type Engine = ReturnType<typeof useMumuEngine>;

function emoteUrl(name: string): string {
  return `${import.meta.env.BASE_URL}mumu/emotes/${name}.png`;
}

/** The long-reading alarm bubble: the limit in the text, a hint to pet Mumu (that snoozes), and a way to actually take the break. */
export interface AlarmBubble {
  limitMinutes: number;
  snoozeMinutes: number;
  onBreak: () => void;
}

const BUTTON_STYLE: CSSProperties = {
  minHeight: 36,
  padding: "4px 10px",
  background: "Canvas",
  color: "CanvasText",
  border: "2px solid CanvasText",
  boxShadow: "0 2px 0 CanvasText",
  font: "inherit",
  whiteSpace: "nowrap",
  cursor: "pointer",
  touchAction: "manipulation",
};

/** The "Previously…" bubble: the chapter recap while the narrator voice plays. Dismissible. */
export interface RecapBubble {
  recap: ActiveRecap;
  onDismiss: () => void;
}

const RECAP_WIDTH = 260;

export default function MumuStage({ engine, alarm = null, recap = null }: { engine: Engine; alarm?: AlarmBubble | null; recap?: RecapBubble | null }) {
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
        const t = e.age / e.life;
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
      {alarm ? (
        // Mumu is clinging in the middle of the page. The bubble itself ignores pointers (the page stays usable around it);
        // only its one button takes them. Petting Mumu is how you snooze.
        <div role="alertdialog" aria-label="Break time" data-mumu-alarm style={{ ...bubbleStyle, maxWidth: 260 }}>
          <div>Mrrow! Break time? ({alarm.limitMinutes} min)</div>
          <div style={{ opacity: 0.75, marginTop: 2 }}>Pet me to snooze {alarm.snoozeMinutes} min</div>
          <div style={{ marginTop: 8 }}>
            <button type="button" data-mumu-break style={{ ...BUTTON_STYLE, pointerEvents: "auto" }} onClick={alarm.onBreak}>
              Take a break
            </button>
          </div>
        </div>
      ) : recap ? (
        // Mumu in its reader corner presents the recap. Only the Skip button takes pointers; the page stays usable around it.
        <div
          key={recap.recap.id}
          role="status"
          data-mumu-recap
          style={{
            ...bubbleStyle,
            left: Math.round(Math.min(Math.max(state.x, RECAP_WIDTH / 2 + 8), Math.max(RECAP_WIDTH / 2 + 8, window.innerWidth - RECAP_WIDTH / 2 - 8))),
            width: RECAP_WIDTH,
            maxWidth: `calc(100vw - 16px)`,
            maxHeight: "50vh",
            overflowY: "auto",
            textAlign: "left",
          }}
        >
          <div style={{ fontWeight: "bold" }}>{RECAP_TITLE}</div>
          <div style={{ marginTop: 2 }}>{recap.recap.text}</div>
          {recap.recap.audioFailed && <div style={{ opacity: 0.75, marginTop: 4 }}>(I couldn&apos;t play the narrator&apos;s voice.)</div>}
          <div style={{ marginTop: 8, textAlign: "right" }}>
            <button type="button" data-mumu-recap-dismiss style={{ ...BUTTON_STYLE, pointerEvents: "auto" }} onClick={recap.onDismiss}>
              Skip
            </button>
          </div>
        </div>
      ) : (
        bubble && (
          <div key={bubble.id} role="status" data-mumu-bubble style={bubbleStyle}>
            {bubble.text}
          </div>
        )
      )}
    </>
  );
}
