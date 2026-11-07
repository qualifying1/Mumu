// rAF adapter around the pure engine: reads the floor element, steps the engine, exposes a snapshot.
import { useCallback, useEffect, useRef, useState } from "react";
import { createMumuState, forceAnim, step, type MumuState } from "./engine.ts";
import { mumuScale, worldFromFloor, type World } from "./layout.ts";
import type { AnimName } from "./sprites.ts";

const MAX_DT_S = 0.1; // a backgrounded tab must not teleport Mumu

export interface MumuSnapshot {
  state: MumuState;
  world: World;
  scale: number;
}

export interface UseMumuEngineOptions {
  /** Other tabs: calmer idle life. */
  calm?: boolean;
}

function readWorld(): { world: World; scale: number } {
  const scale = mumuScale(window.innerWidth);
  const floor = document.querySelector("[data-mumu-floor]");
  const world = worldFromFloor(floor ? floor.getBoundingClientRect() : null, { width: window.innerWidth, height: window.innerHeight }, scale);
  return { world, scale };
}

export function useMumuEngine({ calm = false }: UseMumuEngineOptions = {}) {
  const [snapshot, setSnapshot] = useState<MumuSnapshot>(() => {
    const { world, scale } = readWorld();
    return { state: createMumuState(world, Math.random), world, scale };
  });
  const stateRef = useRef(snapshot.state);
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
      const { world, scale } = readWorld();
      stateRef.current = step(
        stateRef.current,
        { world, calm: calmRef.current, reducedMotion: motion.matches, interacted: interactedRef.current },
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
    const { world } = readWorld();
    stateRef.current = forceAnim(stateRef.current, anim, world, Math.random);
    interactedRef.current = true;
  }, []);

  return { ...snapshot, force };
}
