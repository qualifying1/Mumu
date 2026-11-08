// Adapter for the "Previously…" recap (SPEC F8): listens for the bridge `recap` event, plays the narrator clip with
// Howler (blob URLs need `format: ['mp3']`), and keeps the bubble up until the clip ends (plus a short linger),
// the user dismisses it, the alarm starts, or the reader is left.
// With master audio or voices off there is no sound: the bubble just stays long enough to read.
import { Howl } from "howler";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { db, DEFAULT_SETTINGS } from "../db/db.ts";
import { subscribe, type Recap } from "./bridge.ts";
import { RECAP_LINGER_S } from "./constants.ts";
import { recapVolume, silentRecapSeconds } from "./recap.ts";

export interface ActiveRecap {
  /** Changes for every recap shown, so React restarts the bubble. */
  id: number;
  text: string;
  /** The narrator clip could not be played; the text is still shown, with a note. */
  audioFailed: boolean;
}

export interface MumuRecap {
  recap: ActiveRecap | null;
  /** True from the start of the presentation until the clip (or the reading time) is over: Mumu "talks". */
  speaking: boolean;
  dismiss: () => void;
}

export interface UseMumuRecapOptions {
  /** Recaps are only presented while this is true (the reader); turning it false dismisses the bubble. */
  active: boolean;
  /** The long-reading alarm outranks the recap. */
  alarm: boolean;
}

export function useMumuRecap({ active, alarm }: UseMumuRecapOptions): MumuRecap {
  const [recap, setRecap] = useState<ActiveRecap | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const howlRef = useRef<Howl | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const idRef = useRef(0);

  const audio = useLiveQuery(() => db.settings.get("audio"), []);
  const volume = recapVolume(audio?.key === "audio" ? audio.value : DEFAULT_SETTINGS.audio);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  useEffect(() => {
    howlRef.current?.volume(volume);
  }, [volume]);

  const stop = useCallback(() => {
    window.clearTimeout(timerRef.current);
    howlRef.current?.unload();
    howlRef.current = null;
    setSpeaking(false);
  }, []);

  const dismiss = useCallback(() => {
    stop();
    setRecap(null);
  }, [stop]);

  const start = useCallback(
    (incoming: Recap) => {
      stop();
      idRef.current += 1;
      const id = idRef.current;
      const closeIn = (seconds: number) => {
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setRecap((cur) => (cur?.id === id ? null : cur)), seconds * 1000);
      };
      const failAudio = (what: string, err: unknown) => {
        console.error(`Mumu could not ${what} the recap audio`, err);
        howlRef.current?.unload();
        howlRef.current = null;
        setSpeaking(false);
        setRecap((cur) => (cur?.id === id ? { ...cur, audioFailed: true } : cur));
        closeIn(silentRecapSeconds(incoming.text));
      };

      setRecap({ id, text: incoming.text, audioFailed: false });
      setSpeaking(true);
      if (volumeRef.current <= 0) {
        // Audio is off: the text alone, for a readable while.
        closeIn(silentRecapSeconds(incoming.text));
        return;
      }
      const howl = new Howl({
        src: [incoming.audioUrl],
        format: ["mp3"],
        volume: volumeRef.current,
        onend: () => {
          setSpeaking(false);
          closeIn(RECAP_LINGER_S);
        },
        onloaderror: (_id, err) => failAudio("load", err),
        onplayerror: (_id, err) => failAudio("play", err),
      });
      howlRef.current = howl;
      howl.play();
    },
    [stop],
  );

  // A recap is only presented in the reader, and never over the break alarm.
  const allowedRef = useRef(active && !alarm);
  allowedRef.current = active && !alarm;
  useEffect(
    () =>
      subscribe((e) => {
        if (e.type === "recap" && allowedRef.current) start(e.recap);
      }),
    [start],
  );

  // Leaving the reader or the alarm starting ends the presentation (and its audio).
  useEffect(() => {
    if (!active || alarm) dismiss();
  }, [active, alarm, dismiss]);

  // Closing Mumu's layer (hidden, route change) must not leave a clip playing.
  useEffect(() => stop, [stop]);

  return { recap, speaking, dismiss };
}
