// rAF adapter around the pure engine: reads the floor / nav elements, steps the engine, exposes a snapshot.
import { useCallback, useEffect, useRef, useState } from "react";
import { createMumuState, forceAnim, step, type MumuState } from "./engine.ts";
import { mumuScale, worldForScreen, type World, type WorldScreen } from "./layout.ts";
import type { AnimName } from "./sprites.ts";

const MAX_DT_S = 0.1; // a backgrounded tab must not teleport Mumu

export interface MumuSnapshot {
  state: MumuState;
  world: World;
  scale: number;
}

export interface UseMumuEngineOptions {
  screen: WorldScreen;
  /** Calmer idle life (walk, sit, loaf). Defaults to true on the `other` screen. */
  calm?: boolean;
}

function readWorld(screen: WorldScreen): { world: World; parkX: number | null; scale: number } {
  const scale = mumuScale(window.innerWidth);
  const floor = document.querySelector("[data-mumu-floor]");
  const avoid = document.querySelector("[data-mumu-avoid]");
  const { world, parkX } = worldForScreen({
    screen,
    floor: floor ? floor.getBoundingClientRect() : null,
    avoid: avoid ? avoid.getBoundingClientRect() : null,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    scale,
  });
  return { world, parkX, scale };
}

export function useMumuEngine({ screen, calm }: UseMumuEngineOptions) {
  const [snapshot, setSnapshot] = useState<MumuSnapshot>(() => {
    const { world, scale } = readWorld(screen);
    return { state: createMumuState(world, Math.random), world, scale };
  });
  const stateRef = useRef(snapshot.state);
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const calmRef = useRef(calm);
  calmRef.current = calm;
  const interactedRef = useRef(false);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, MAX_DT_S);
      last = now;
      const { world, parkX, scale } = readWorld(screenRef.current);
      stateRef.current = step(
        stateRef.current,
        {
          world,
          calm: calmRef.current ?? screenRef.current === "other",
          reducedMotion: motion.matches,
          interacted: interactedRef.current,
          parkAt: parkX,
        },
        dt,
        Math.random,
      );
      interactedRef.current = false;
      setSnapshot({ state: stateRef.current, world, scale });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  /** Switch animation now (lab buttons). Counts as an interaction. */
  const force = useCallback((anim: AnimName) => {
    const { world } = readWorld(screenRef.current);
    stateRef.current = forceAnim(stateRef.current, anim, world, Math.random);
    interactedRef.current = true;
  }, []);

  return { ...snapshot, force };
}
