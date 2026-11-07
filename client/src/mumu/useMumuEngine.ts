// rAF adapter around the pure engine: reads the floor / ledge / nav elements, feeds pointer actions in,
// steps the engine, and runs its one-shot effects (sounds, the read-time bubble).
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { db, DEFAULT_SETTINGS } from "../db/db.ts";
import { BUBBLE_S } from "./constants.ts";
import type { Mood } from "@mumu/shared";
import { createMumuState, forceAnim, startClimbWalk, step, type Effect, type MumuState } from "./engine.ts";
import type { MumuAction } from "./gesture.ts";
import { cornerForDrop, mumuScale, playfieldFor, worldForScreen, type ParkCorner, type Playfield, type World, type WorldScreen } from "./layout.ts";
import { loadParkCorner, saveParkCorner } from "./parkCorner.ts";
import { localDateKey, readTimeMessage } from "./readTime.ts";
import { createMumuSounds, type MumuSounds } from "./sounds.ts";
import type { AnimName } from "./sprites.ts";

const MAX_DT_S = 0.1; // a backgrounded tab must not teleport Mumu

export interface MumuSnapshot {
  state: MumuState;
  world: World;
  field: Playfield;
  scale: number;
}

export interface UseMumuEngineOptions {
  screen: WorldScreen;
  /** Calmer idle life (walk, sit, loaf). Defaults to true on the `other` screen. */
  calm?: boolean;
  /** The long-reading alarm is ringing (from useReadingTimer). */
  alarm?: boolean;
  /** Mumu was petted while the alarm rang: that is the dismissal (the caller snoozes the timer). */
  onAlarmPetted?: () => void;
  /** The region mood at the read line (from the bridge); null outside the reader. The engine debounces it. */
  mood?: Mood | null;
  /** The recap is being presented (Mumu talks). */
  speaking?: boolean;
}

function readWorld(screen: WorldScreen, corner: ParkCorner): { world: World; field: Playfield; parkX: number | null; scale: number } {
  const scale = mumuScale(window.innerWidth);
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const floor = document.querySelector("[data-mumu-floor]");
  const avoid = document.querySelector("[data-mumu-avoid]");
  const { world, parkX } = worldForScreen({
    screen,
    floor: floor ? floor.getBoundingClientRect() : null,
    avoid: avoid ? avoid.getBoundingClientRect() : null,
    viewport,
    scale,
    corner,
  });
  // Shelf planks only exist on Home; elsewhere there is nothing to hang from or climb to.
  const ledgeRects = screen === "home" ? [...document.querySelectorAll("[data-mumu-ledge]")].map((el) => el.getBoundingClientRect()) : [];
  return { world, field: playfieldFor({ viewport, scale, ledgeRects }), parkX, scale };
}

export interface MumuBubble {
  id: number;
  text: string;
}

export function useMumuEngine({ screen, calm, alarm = false, onAlarmPetted, mood = null, speaking = false }: UseMumuEngineOptions) {
  // The reader corner Mumu sits in; dropping it in the other half of the screen switches and remembers (F8).
  const cornerRef = useRef<ParkCorner>(loadParkCorner());
  const [snapshot, setSnapshot] = useState<MumuSnapshot>(() => {
    const { world, field, scale } = readWorld(screen, cornerRef.current);
    return { state: createMumuState(world, Math.random), world, field, scale };
  });
  const moodRef = useRef(mood);
  moodRef.current = mood;
  const speakingRef = useRef(speaking);
  speakingRef.current = speaking;
  const [bubble, setBubble] = useState<MumuBubble | null>(null);
  const stateRef = useRef(snapshot.state);
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const calmRef = useRef(calm);
  calmRef.current = calm;
  const alarmRef = useRef(alarm);
  alarmRef.current = alarm;
  const alarmPettedRef = useRef(onAlarmPetted);
  alarmPettedRef.current = onAlarmPetted;
  const interactedRef = useRef(false);
  const actionsRef = useRef<MumuAction[]>([]);
  const soundsRef = useRef<MumuSounds | null>(null);
  const bubbleTimer = useRef<number | undefined>(undefined);
  const bubbleId = useRef(0);

  // Sound settings: master audio and Mumu sounds both have to be on (F8).
  const audio = useLiveQuery(() => db.settings.get("audio"), []);
  const mumuSetting = useLiveQuery(() => db.settings.get("mumu"), []);
  const master = audio?.key === "audio" ? audio.value.master : DEFAULT_SETTINGS.audio.master;
  const mumuSounds = mumuSetting?.key === "mumu" ? mumuSetting.value.sounds : DEFAULT_SETTINGS.mumu.sounds;
  const soundSettings = { enabled: master.on && mumuSounds, volume: master.volume };
  const soundSettingsRef = useRef(soundSettings);
  soundSettingsRef.current = soundSettings;
  useEffect(() => {
    soundsRef.current?.configure(soundSettings);
  }, [soundSettings.enabled, soundSettings.volume]); // eslint-disable-line react-hooks/exhaustive-deps

  const showBubble = useCallback((text: string) => {
    window.clearTimeout(bubbleTimer.current);
    bubbleId.current += 1;
    setBubble({ id: bubbleId.current, text });
    bubbleTimer.current = window.setTimeout(() => setBubble(null), BUBBLE_S * 1000);
  }, []);

  const hideBubble = useCallback(() => {
    window.clearTimeout(bubbleTimer.current);
    setBubble(null);
  }, []);

  const runEffect = useCallback(
    (effect: Effect) => {
      const sounds = soundsRef.current;
      if (effect.type === "sound") sounds?.play(effect.name);
      else if (effect.type === "alarmPetted") alarmPettedRef.current?.();
      else if (effect.type === "readTime") {
        db.readingLog
          .get(localDateKey(new Date()))
          .then((row) => showBubble(readTimeMessage(row?.seconds)))
          .catch((err: unknown) => {
            console.error("Mumu could not read the reading log", err);
            showBubble("Mrr? I lost my reading notes.");
          });
      }
    },
    [showBubble],
  );

  useEffect(() => {
    const sounds = createMumuSounds(soundSettingsRef.current);
    soundsRef.current = sounds;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, MAX_DT_S);
      last = now;
      const { world, field, parkX, scale } = readWorld(screenRef.current, cornerRef.current);
      const actions = actionsRef.current;
      actionsRef.current = [];
      const wasPetted = stateRef.current.petLeft > 0;
      const wasHeld = stateRef.current.mode === "held";
      stateRef.current = step(
        stateRef.current,
        {
          world,
          field,
          calm: calmRef.current ?? screenRef.current === "other",
          reducedMotion: motion.matches,
          interacted: interactedRef.current,
          parkAt: parkX,
          actions,
          alarm: alarmRef.current,
          mood: moodRef.current,
          speaking: speakingRef.current,
        },
        dt,
        Math.random,
      );
      interactedRef.current = false;
      // Let go in the reader: wherever Mumu was dropped decides its corner, and it walks there.
      if (wasHeld && stateRef.current.mode !== "held" && parkX !== null) {
        const corner = cornerForDrop(stateRef.current.x, window.innerWidth);
        if (corner !== cornerRef.current) {
          cornerRef.current = corner;
          saveParkCorner(corner);
        }
      }
      sounds.setPurring(stateRef.current.purring);
      for (const effect of stateRef.current.effects) runEffect(effect);
      if (!wasPetted && stateRef.current.petLeft > 0) hideBubble(); // the hearts replace the read-time bubble
      setSnapshot({ state: stateRef.current, world, field, scale });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(bubbleTimer.current);
      sounds.dispose();
      soundsRef.current = null;
    };
  }, [runEffect, hideBubble]);

  /** Switch animation now (lab buttons). Counts as an interaction. */
  const force = useCallback((anim: AnimName) => {
    const { world } = readWorld(screenRef.current, cornerRef.current);
    stateRef.current = forceAnim(stateRef.current, anim, world, Math.random);
    interactedRef.current = true;
  }, []);

  /** The "go climb" idle choice on demand (lab button): walk to the nearer edge and climb it, or turn around if nothing is above. */
  const goClimb = useCallback(() => {
    const { world, field, parkX } = readWorld(screenRef.current, cornerRef.current);
    const input = {
      world,
      field,
      calm: calmRef.current ?? screenRef.current === "other",
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      interacted: true,
      parkAt: parkX,
    };
    // Ground mode first; if Mumu is off the floor it falls or jumps back on by itself, never snaps.
    const grounded = forceAnim(stateRef.current, "sit", world, Math.random);
    stateRef.current = startClimbWalk(grounded, input, Math.random);
    interactedRef.current = true;
  }, []);

  /** Queue pointer actions for the next frame. */
  const dispatch = useCallback((actions: readonly MumuAction[]) => {
    actionsRef.current.push(...actions);
  }, []);

  return { ...snapshot, bubble, force, goClimb, dispatch };
}
