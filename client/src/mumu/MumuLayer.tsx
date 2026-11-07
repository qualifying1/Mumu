// Full-screen overlay mounted once in the app root (CONTRACT §10). Mumu is on screen on every
// route (Home, the other tabs, the reader), except /dev/mumu where the lab runs its own Mumu.
// The layer is `pointer-events: none`; only Mumu's own element takes pointer events (C2).
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { db, DEFAULT_SETTINGS } from "../db/db.ts";
import { subscribe, type Screen } from "./bridge.ts";
import MumuSprite from "./MumuSprite.tsx";
import { useMumuEngine } from "./useMumuEngine.ts";

function screenFromPath(pathname: string): Screen {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/read/")) return "reader";
  return "other";
}

/** The screen Mumu lives on: B's `setScreen` once it has called it, the route until then. */
function useMumuScreen(): Screen {
  const { pathname } = useLocation();
  const [bridged, setBridged] = useState<{ screen: Screen; pathname: string } | null>(null);
  useEffect(
    () =>
      subscribe((e) => {
        if (e.type === "screen") setBridged({ screen: e.screen, pathname: window.location.pathname });
      }),
    [],
  );
  // A bridge value only counts for the route it was sent on; navigating hands control back to the route.
  return bridged && bridged.pathname === pathname ? bridged.screen : screenFromPath(pathname);
}

function MumuActor({ screen }: { screen: Screen }) {
  const { state, world, scale } = useMumuEngine({ screen });
  return <MumuSprite anim={state.anim} animTime={state.animTime} facing={state.facing} scale={scale} x={state.x} floorY={world.floorY} />;
}

export default function MumuLayer() {
  const { pathname } = useLocation();
  const screen = useMumuScreen();
  // Dexie live query: undefined while loading, and until the settings are seeded (B1) the defaults apply.
  const setting = useLiveQuery(() => db.settings.get("mumu"), []);
  const mumu = setting?.key === "mumu" ? setting.value : DEFAULT_SETTINGS.mumu;

  if (pathname.startsWith("/dev/mumu")) return null;
  if (!mumu.visible) return null; // F8 "Hidden": nothing rendered (the reading timer is separate)
  return <MumuActor screen={screen} />;
}
