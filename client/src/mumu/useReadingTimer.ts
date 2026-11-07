// Clock, visibility, bridge-activity and Dexie adapter around the pure reading timer (timer.ts).
// Mounted above every "Mumu hidden" early return, because hiding Mumu must not stop the timer (F8).
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { db, DEFAULT_SETTINGS } from "../db/db.ts";
import { requestBreak, subscribe } from "./bridge.ts";
import { addReadingSeconds } from "./readingLog.ts";
import { alarmActive, createTimer, snooze, stepTimer, takeBreak, type TimerConfig, type TimerState } from "./timer.ts";

const TICK_MS = 250;
const MAX_DT_S = 5; // a sleeping laptop must not count as reading

export interface ReadingTimerOptions {
  inReader: boolean;
  /** MumuLab: use this instead of `settings.wellbeing` (so the lab never edits the real setting). */
  override?: TimerConfig;
  /** MumuLab's fake reader: don't write the readingLog. Defaults to true. */
  log?: boolean;
}

export interface ReadingTimer {
  alarm: boolean;
  config: TimerConfig;
  /** Continuous reading seconds (whole), for the lab readout. */
  sessionS: number;
  /** "Snooze N min": quiet until N more minutes of reading. */
  snooze: () => void;
  /** "Take a break": asks the app to leave the reader (bridge) and starts the session over. */
  takeBreak: () => void;
  /** Lab only: pretend `seconds` of reading passed. */
  warp: (seconds: number) => void;
}

export function useReadingTimer({ inReader, override, log = true }: ReadingTimerOptions): ReadingTimer {
  const setting = useLiveQuery(() => db.settings.get("wellbeing"), []);
  const config: TimerConfig = override ?? (setting?.key === "wellbeing" ? setting.value : DEFAULT_SETTINGS.wellbeing);

  const stateRef = useRef<TimerState>(createTimer());
  const inReaderRef = useRef(inReader);
  inReaderRef.current = inReader;
  const configRef = useRef(config);
  configRef.current = config;
  const logRef = useRef(log);
  logRef.current = log;
  const activityRef = useRef(false);
  const [view, setView] = useState({ alarm: false, sessionS: 0 });

  const publish = useCallback(() => {
    const alarm = alarmActive(stateRef.current, inReaderRef.current, configRef.current);
    const sessionS = Math.floor(stateRef.current.sessionS);
    setView((v) => (v.alarm === alarm && v.sessionS === sessionS ? v : { alarm, sessionS }));
  }, []);

  /** Advance the timer by `dt` seconds and write any log effects. */
  const advance = useCallback(
    (dt: number) => {
      const r = stepTimer(stateRef.current, {
        dt,
        inReader: inReaderRef.current,
        visible: document.visibilityState === "visible",
        activity: activityRef.current,
        config: configRef.current,
      });
      activityRef.current = false;
      stateRef.current = r.state;
      for (const effect of r.effects) {
        if (!logRef.current) continue;
        addReadingSeconds(effect.seconds).catch((err: unknown) => console.error("Mumu could not write the reading log", err));
      }
      publish();
    },
    [publish],
  );

  useEffect(
    () =>
      subscribe((e) => {
        if (e.type === "activity") activityRef.current = true;
      }),
    [],
  );

  useEffect(() => {
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, MAX_DT_S);
      last = now;
      advance(dt);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [advance]);

  // A change of limit, or of screen, shows up at once rather than on the next tick.
  useEffect(publish, [publish, inReader, config.limitMinutes, config.snoozeMinutes]);

  return {
    alarm: view.alarm,
    config,
    sessionS: view.sessionS,
    snooze: useCallback(() => {
      stateRef.current = snooze(stateRef.current, configRef.current);
      publish();
    }, [publish]),
    takeBreak: useCallback(() => {
      stateRef.current = takeBreak(stateRef.current);
      publish();
      requestBreak(); // B's onBreakRequested callback leaves the reader for Home
    }, [publish]),
    warp: useCallback((seconds: number) => advance(seconds), [advance]),
  };
}
