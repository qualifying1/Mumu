// The reading timer and long-reading alarm (SPEC F8), as a pure state machine: no clock, no DOM, no database.
// Counts while the reader is open, the page is visible and there was activity in the last ACTIVITY_WINDOW_S.
// Emits `log` effects (whole seconds) every LOG_EVERY_S for the readingLog; the adapter writes them.
import { ACTIVITY_WINDOW_S, LOG_EVERY_S, SESSION_RESET_OUTSIDE_S } from "./constants.ts";

export interface TimerConfig {
  /** 0 = alarm off */
  limitMinutes: number;
  snoozeMinutes: number;
}

export interface TimerState {
  /** Continuous reading seconds. */
  sessionS: number;
  sinceActivityS: number;
  /** Seconds spent outside the reader (resets the session after SESSION_RESET_OUTSIDE_S). */
  outsideS: number;
  /** Counted seconds not yet written to the log. */
  pendingS: number;
  sinceLogS: number;
  /** After "Snooze": the session second at which the alarm may ring again. */
  snoozeUntilS: number | null;
  wasInReader: boolean;
  wasCounting: boolean;
}

export interface TimerInput {
  dt: number;
  inReader: boolean;
  visible: boolean;
  /** A scroll or tap happened since the last step. */
  activity: boolean;
  config: TimerConfig;
}

export type TimerEffect = { type: "log"; seconds: number };

export function createTimer(): TimerState {
  return { sessionS: 0, sinceActivityS: ACTIVITY_WINDOW_S, outsideS: 0, pendingS: 0, sinceLogS: 0, snoozeUntilS: null, wasInReader: false, wasCounting: false };
}

/** Is the alarm up? Only in the reader, with a limit set, once the session reaches it (and any snooze is over). */
export function alarmActive(state: TimerState, inReader: boolean, config: TimerConfig): boolean {
  if (!inReader || config.limitMinutes <= 0) return false;
  if (state.sessionS < config.limitMinutes * 60) return false;
  return state.snoozeUntilS === null || state.sessionS >= state.snoozeUntilS;
}

export function stepTimer(state: TimerState, input: TimerInput): { state: TimerState; effects: TimerEffect[]; alarm: boolean } {
  const { dt, inReader, visible, config } = input;
  // Opening the reader counts as activity.
  const active = input.activity || (inReader && !state.wasInReader);
  let s: TimerState = { ...state, sinceActivityS: active ? 0 : state.sinceActivityS + dt, wasInReader: inReader };

  const counting = inReader && visible && s.sinceActivityS < ACTIVITY_WINDOW_S;
  if (counting) {
    s = { ...s, sessionS: s.sessionS + dt, pendingS: s.pendingS + dt, sinceLogS: s.sinceLogS + dt, outsideS: 0 };
  } else if (!inReader) {
    const outsideS = s.outsideS + dt;
    s = outsideS >= SESSION_RESET_OUTSIDE_S ? { ...s, outsideS, sessionS: 0, snoozeUntilS: null } : { ...s, outsideS };
  }

  // Write every LOG_EVERY_S while reading, and once more when counting stops, so nothing is lost.
  const effects: TimerEffect[] = [];
  const stopped = state.wasCounting && !counting;
  if ((s.sinceLogS >= LOG_EVERY_S || stopped) && Math.floor(s.pendingS) >= 1) {
    const seconds = Math.floor(s.pendingS);
    effects.push({ type: "log", seconds });
    s = { ...s, pendingS: s.pendingS - seconds, sinceLogS: 0 };
  } else if (s.sinceLogS >= LOG_EVERY_S) {
    s = { ...s, sinceLogS: 0 };
  }
  s = { ...s, wasCounting: counting };

  return { state: s, effects, alarm: alarmActive(s, inReader, config) };
}

/** "Snooze N min": quiet until N more minutes of reading. */
export function snooze(state: TimerState, config: TimerConfig): TimerState {
  return { ...state, snoozeUntilS: state.sessionS + config.snoozeMinutes * 60 };
}

/** "Take a break": the continuous session starts over. */
export function takeBreak(state: TimerState): TimerState {
  return { ...state, sessionS: 0, snoozeUntilS: null, outsideS: 0 };
}
