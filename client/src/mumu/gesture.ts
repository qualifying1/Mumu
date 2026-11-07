// Pure pointer gesture classifier: raw pointer samples -> engine actions.
// press + move > DRAG_THRESHOLD_PX = drag (grab, move..., release); press + release = tap;
// hovering the cursor back and forth across Mumu = stroke (desktop petting).
// Times are seconds (any origin); the caller converts event.timeStamp.
import { DRAG_THRESHOLD_PX, STROKE_MIN_STEP_PX, STROKE_REVERSALS, STROKE_WINDOW_S } from "./constants.ts";

export type GestureEvent =
  | { type: "down"; x: number; y: number; t: number }
  | { type: "move"; x: number; y: number; t: number; pressed: boolean }
  | { type: "up"; x: number; y: number; t: number }
  /** pointercancel / lost capture / the pointer left Mumu while hovering */
  | { type: "cancel" };

/** What the engine consumes. Coordinates are viewport px of the pointer. */
export type MumuAction =
  | { type: "grab"; x: number; y: number }
  | { type: "move"; x: number; y: number }
  | { type: "release" }
  | { type: "tap" }
  | { type: "stroke" };

export interface GestureState {
  phase: "idle" | "pressed" | "dragging";
  startX: number;
  startY: number;
  hover: { dir: 0 | 1 | -1; anchorX: number; reversals: number[] } | null;
}

export function createGesture(): GestureState {
  return { phase: "idle", startX: 0, startY: 0, hover: null };
}

function hoverStep(state: GestureState, x: number, t: number): { state: GestureState; stroke: boolean } {
  const h = state.hover ?? { dir: 0 as const, anchorX: x, reversals: [] as number[] };
  const delta = x - h.anchorX;
  let { dir, anchorX, reversals } = h;
  let stroke = false;
  if (dir === 0) {
    if (Math.abs(delta) >= STROKE_MIN_STEP_PX) {
      dir = delta > 0 ? 1 : -1;
      anchorX = x;
    }
  } else if (Math.sign(delta) === dir) {
    anchorX = x; // still travelling the same way: the anchor is the furthest point so far
  } else if (Math.abs(delta) >= STROKE_MIN_STEP_PX) {
    dir = dir === 1 ? -1 : 1; // retreated far enough: that is a reversal
    anchorX = x;
    reversals = [...reversals.filter((r) => t - r <= STROKE_WINDOW_S), t];
    if (reversals.length >= STROKE_REVERSALS) {
      stroke = true;
      reversals = [];
      dir = 0;
    }
  }
  return { state: { ...state, hover: { dir, anchorX, reversals } }, stroke };
}

export function gestureStep(state: GestureState, event: GestureEvent): { state: GestureState; actions: MumuAction[] } {
  switch (event.type) {
    case "down":
      return { state: { phase: "pressed", startX: event.x, startY: event.y, hover: null }, actions: [] };
    case "move": {
      if (state.phase === "idle") {
        if (event.pressed) return { state, actions: [] }; // a press that started elsewhere
        const h = hoverStep(state, event.x, event.t);
        return { state: h.state, actions: h.stroke ? [{ type: "stroke" }] : [] };
      }
      if (state.phase === "dragging") return { state, actions: [{ type: "move", x: event.x, y: event.y }] };
      const dist = Math.hypot(event.x - state.startX, event.y - state.startY);
      if (dist <= DRAG_THRESHOLD_PX) return { state, actions: [] };
      return { state: { ...state, phase: "dragging" }, actions: [{ type: "grab", x: event.x, y: event.y }] };
    }
    case "up": {
      const next = createGesture();
      if (state.phase === "dragging") return { state: next, actions: [{ type: "release" }] };
      if (state.phase === "pressed") return { state: next, actions: [{ type: "tap" }] };
      return { state: next, actions: [] };
    }
    case "cancel":
      return { state: createGesture(), actions: state.phase === "dragging" ? [{ type: "release" }] : [] };
  }
}
