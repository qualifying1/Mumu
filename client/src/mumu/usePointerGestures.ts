// Pointer events on Mumu's own element -> the pure gesture classifier -> engine actions.
// Mouse and touch share one path (pointer events); the element has `touch-action: none` so a drag never scrolls.
import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { createGesture, gestureStep, type GestureEvent, type MumuAction } from "./gesture.ts";

export interface PointerHandlers {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
  onLostPointerCapture: () => void;
  onPointerLeave: () => void;
  onContextMenu: (e: ReactPointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => void;
}

export function usePointerGestures(dispatch: (actions: readonly MumuAction[]) => void): PointerHandlers {
  const gesture = useRef(createGesture());

  return useMemo(() => {
    const feed = (event: GestureEvent) => {
      const result = gestureStep(gesture.current, event);
      gesture.current = result.state;
      if (result.actions.length > 0) dispatch(result.actions);
    };
    return {
      onPointerDown(e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        feed({ type: "down", x: e.clientX, y: e.clientY, t: e.timeStamp / 1000 });
      },
      onPointerMove(e) {
        feed({ type: "move", x: e.clientX, y: e.clientY, t: e.timeStamp / 1000, pressed: e.buttons !== 0 });
      },
      onPointerUp(e) {
        feed({ type: "up", x: e.clientX, y: e.clientY, t: e.timeStamp / 1000 });
      },
      onPointerCancel: () => feed({ type: "cancel" }),
      // Capture is released right after pointerup; by then the gesture is already idle, so this is a no-op then.
      onLostPointerCapture: () => feed({ type: "cancel" }),
      onPointerLeave: () => feed({ type: "cancel" }),
      // A long press on touch must not open the browser's context menu in the middle of a drag.
      onContextMenu: (e) => e.preventDefault(),
    };
  }, [dispatch]);
}
