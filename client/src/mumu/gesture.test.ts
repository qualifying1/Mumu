import { describe, expect, it } from "vitest";
import { DRAG_THRESHOLD_PX } from "./constants.ts";
import { createGesture, gestureStep, type GestureEvent, type MumuAction } from "./gesture.ts";

function run(events: GestureEvent[]): MumuAction[] {
  let s = createGesture();
  const out: MumuAction[] = [];
  for (const e of events) {
    const r = gestureStep(s, e);
    s = r.state;
    out.push(...r.actions);
  }
  return out;
}

describe("press gestures", () => {
  it("press + release without moving is a tap", () => {
    expect(run([{ type: "down", x: 10, y: 10, t: 0 }, { type: "up", x: 10, y: 10, t: 0.1 }])).toEqual([{ type: "tap" }]);
  });

  it("a wobble within the threshold is still a tap", () => {
    expect(
      run([
        { type: "down", x: 10, y: 10, t: 0 },
        { type: "move", x: 10 + DRAG_THRESHOLD_PX, y: 10, t: 0.05, pressed: true },
        { type: "up", x: 10, y: 10, t: 0.1 },
      ]),
    ).toEqual([{ type: "tap" }]);
  });

  it("moving more than the threshold grabs, follows, then releases (no tap)", () => {
    const actions = run([
      { type: "down", x: 10, y: 10, t: 0 },
      { type: "move", x: 10 + DRAG_THRESHOLD_PX + 1, y: 10, t: 0.05, pressed: true },
      { type: "move", x: 50, y: 40, t: 0.1, pressed: true },
      { type: "up", x: 50, y: 40, t: 0.15 },
    ]);
    expect(actions).toEqual([
      { type: "grab", x: 19, y: 10 },
      { type: "move", x: 50, y: 40 },
      { type: "release" },
    ]);
  });

  it("pointercancel mid-drag releases so Mumu is never stuck held", () => {
    const actions = run([
      { type: "down", x: 0, y: 0, t: 0 },
      { type: "move", x: 30, y: 0, t: 0.1, pressed: true },
      { type: "cancel" },
    ]);
    expect(actions.at(-1)).toEqual({ type: "release" });
  });

  it("cancel before the drag starts does nothing", () => {
    expect(run([{ type: "down", x: 0, y: 0, t: 0 }, { type: "cancel" }])).toEqual([]);
  });
});

describe("stroke (hover petting)", () => {
  const hover = (x: number, t: number): GestureEvent => ({ type: "move", x, y: 0, t, pressed: false });

  it("three reversals within 1.5 s is a stroke", () => {
    const xs = [0, 20, 0, 20, 0]; // right, left, right, left = 3 reversals
    expect(run(xs.map((x, i) => hover(x, i * 0.2)))).toEqual([{ type: "stroke" }]);
  });

  it("slow back and forth outside the window is not a stroke", () => {
    const xs = [0, 20, 0, 20, 0];
    expect(run(xs.map((x, i) => hover(x, i * 1)))).toEqual([]);
  });

  it("small jitter is not a stroke", () => {
    const xs = [0, 2, 0, 2, 0, 2, 0, 2];
    expect(run(xs.map((x, i) => hover(x, i * 0.1)))).toEqual([]);
  });

  it("moving one way never strokes", () => {
    expect(run([0, 10, 20, 30, 40, 50].map((x, i) => hover(x, i * 0.1)))).toEqual([]);
  });
});
