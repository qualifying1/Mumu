import { describe, expect, it } from "vitest";
import { ACTIVITY_WINDOW_S, LOG_EVERY_S, SESSION_RESET_OUTSIDE_S } from "./constants.ts";
import { alarmActive, createTimer, snooze, stepTimer, takeBreak, type TimerConfig, type TimerEffect, type TimerInput, type TimerState } from "./timer.ts";

const config: TimerConfig = { limitMinutes: 1, snoozeMinutes: 2 };
const reading: TimerInput = { dt: 1, inReader: true, visible: true, activity: false, config };

interface Run {
  state: TimerState;
  alarm: boolean;
  logged: number;
  effects: TimerEffect[];
}

/** Step `seconds` one second at a time; `activityAt` lists the seconds (0-based) that get an activity event. */
function run(from: TimerState | Run, seconds: number, over: Partial<TimerInput> = {}, activityAt: number[] = [0]): Run {
  let state = "state" in from ? from.state : from;
  let alarm = false;
  let logged = 0;
  const effects: TimerEffect[] = [];
  for (let i = 0; i < seconds; i++) {
    const r = stepTimer(state, { ...reading, ...over, activity: activityAt.includes(i) });
    state = r.state;
    alarm = r.alarm;
    for (const e of r.effects) {
      effects.push(e);
      logged += e.seconds;
    }
  }
  return { state, alarm, logged, effects };
}

describe("counting", () => {
  it("counts while the reader is open, visible and active", () => {
    expect(run(createTimer(), 30).state.sessionS).toBe(30);
  });

  it("opening the reader counts as activity by itself", () => {
    const r = stepTimer(createTimer(), { ...reading, activity: false });
    expect(r.state.sessionS).toBe(1);
  });

  it("does not count outside the reader, or with the page hidden", () => {
    expect(run(createTimer(), 30, { inReader: false }).state.sessionS).toBe(0);
    expect(run(createTimer(), 30, { visible: false }).state.sessionS).toBe(0);
  });

  it("stops counting after 120 s without activity, and resumes on activity", () => {
    const idle = run(createTimer(), ACTIVITY_WINDOW_S + 60);
    expect(idle.state.sessionS).toBe(ACTIVITY_WINDOW_S);
    const frozen = idle.state.sessionS;
    expect(run(idle, 30, {}, []).state.sessionS).toBe(frozen);
    expect(run(idle, 10, {}, [0]).state.sessionS).toBe(frozen + 10);
  });

  it("activity in the last 120 s keeps it counting indefinitely", () => {
    const acts = Array.from({ length: 20 }, (_, i) => i * 100);
    expect(run(createTimer(), 2000, {}, acts).state.sessionS).toBe(2000);
  });
});

describe("session reset", () => {
  it("survives a short trip outside, resets after 5 minutes outside", () => {
    const reader = run(createTimer(), 100);
    const away = run(reader, SESSION_RESET_OUTSIDE_S - 1, { inReader: false });
    expect(away.state.sessionS).toBe(100);
    const long = run(away, 2, { inReader: false });
    expect(long.state.sessionS).toBe(0);
  });

  it("coming back before the reset keeps the outside clock from carrying over", () => {
    let r = run(createTimer(), 50);
    r = run(r, 200, { inReader: false });
    r = run(r, 10); // back in the reader: counting resets the outside clock
    r = run(r, 250, { inReader: false });
    expect(r.state.sessionS).toBe(60);
  });

  it("hidden-page time in the reader is not 'outside'", () => {
    const r = run(run(createTimer(), 50), 1000, { visible: false });
    expect(r.state.sessionS).toBe(50);
  });
});

describe("alarm", () => {
  it("rings once the continuous session reaches the limit, and stays up until dealt with", () => {
    const before = run(createTimer(), 59);
    expect(before.alarm).toBe(false);
    const at = run(before, 1);
    expect(at.alarm).toBe(true);
    expect(run(at, 30).alarm).toBe(true);
  });

  it("is off with limit 0", () => {
    expect(run(createTimer(), 5000, { config: { limitMinutes: 0, snoozeMinutes: 2 } }, [0, 100, 200]).alarm).toBe(false);
  });

  it("is only ever up in the reader", () => {
    const rung = run(createTimer(), 60);
    expect(rung.alarm).toBe(true);
    expect(stepTimer(rung.state, { ...reading, inReader: false }).alarm).toBe(false);
    // ...and it is back when the reader reopens within 5 minutes.
    expect(stepTimer(rung.state, reading).alarm).toBe(true);
  });

  it("snooze silences it, then it rings again after N more minutes of reading", () => {
    const rung = run(createTimer(), 60);
    const snoozed = snooze(rung.state, config);
    expect(alarmActive(snoozed, true, config)).toBe(false);
    const quiet = run(snoozed, 2 * 60 - 1, {}, [0, 50]);
    expect(quiet.alarm).toBe(false);
    expect(run(quiet, 1).alarm).toBe(true);
  });

  it("snoozed time only passes while reading", () => {
    const snoozed = snooze(run(createTimer(), 60).state, config);
    const away = run(snoozed, 200, { inReader: false });
    expect(away.state.sessionS).toBe(60);
    expect(alarmActive(away.state, true, config)).toBe(false);
  });

  it("take a break resets the session and silences the alarm, until the limit comes round again", () => {
    const rung = run(createTimer(), 90);
    const broke = takeBreak(rung.state);
    expect(broke.sessionS).toBe(0);
    expect(alarmActive(broke, true, config)).toBe(false);
    expect(run(broke, 59, {}, [0]).alarm).toBe(false);
    expect(run(broke, 60, {}, [0]).alarm).toBe(true);
  });

  it("follows live changes to the limit", () => {
    const r = run(createTimer(), 90);
    expect(r.alarm).toBe(true);
    expect(stepTimer(r.state, { ...reading, config: { limitMinutes: 5, snoozeMinutes: 2 } }).alarm).toBe(false);
    expect(stepTimer(r.state, { ...reading, config: { limitMinutes: 0, snoozeMinutes: 2 } }).alarm).toBe(false);
  });
});

describe("reading log", () => {
  it("writes every 15 s while reading, in whole seconds", () => {
    const r = run(createTimer(), LOG_EVERY_S * 4);
    expect(r.effects).toEqual(Array.from({ length: 4 }, () => ({ type: "log", seconds: LOG_EVERY_S })));
  });

  it("writes nothing when nothing counted", () => {
    expect(run(createTimer(), 100, { inReader: false }).effects).toEqual([]);
    expect(run(createTimer(), 100, { visible: false }).effects).toEqual([]);
  });

  it("flushes the remainder when counting stops (leaving the reader), so no time is lost", () => {
    const reader = run(createTimer(), 22); // 15 logged, 7 pending
    expect(reader.logged).toBe(15);
    const left = run(reader, 1, { inReader: false });
    expect(left.logged).toBe(7);
    expect(left.state.pendingS).toBeCloseTo(0);
  });

  it("the logged total always equals the counted time (fractional steps carry over)", () => {
    let state = createTimer();
    let logged = 0;
    for (let i = 0; i < 1000; i++) {
      const r = stepTimer(state, { ...reading, dt: 0.1, activity: i === 0 });
      state = r.state;
      for (const e of r.effects) logged += e.seconds;
    }
    const final = stepTimer(state, { ...reading, dt: 0.1, inReader: false });
    for (const e of final.effects) logged += e.seconds;
    expect(logged + Math.floor(final.state.pendingS)).toBe(Math.floor(state.sessionS));
    expect(Number.isInteger(logged)).toBe(true);
  });

  it("does not log hidden or idle time", () => {
    const r = run(createTimer(), 10);
    const hidden = run(r, 100, { visible: false });
    // Only the 10 counted seconds are ever written (flushed when the page went hidden); the 100 hidden ones are not.
    expect(r.logged + hidden.logged).toBe(10);
    const idle = run(hidden, 5, {});
    expect(idle.logged).toBe(0);
  });
});
