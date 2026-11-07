// Full-screen overlay mounted once in the app root (CONTRACT §10). Mumu is on screen on every
// route (Home, the other tabs, the reader), except /dev/mumu where the lab runs its own Mumu.
// There is no full-screen element at all: only Mumu's own sprite takes pointer events (touch-action: none),
// so the pages underneath keep scrolling and tapping everywhere else.
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { db, DEFAULT_SETTINGS } from "../db/db.ts";
import type { Mood } from "@mumu/shared";
import { subscribe, type Screen } from "./bridge.ts";
import MumuStage from "./MumuStage.tsx";
import { useMumuEngine } from "./useMumuEngine.ts";
import { useMumuRecap } from "./useMumuRecap.ts";
import { useReadingTimer, type ReadingTimer } from "./useReadingTimer.ts";

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

/** The region mood B reports. Tracked above the "Mumu hidden" returns so a mood set earlier is still known when Mumu appears. */
function useBridgeMood(): Mood | null {
  const [mood, setMood] = useState<Mood | null>(null);
  useEffect(
    () =>
      subscribe((e) => {
        if (e.type === "mood") setMood(e.mood);
      }),
    [],
  );
  return mood;
}

function MumuActor({ screen, mood, timer }: { screen: Screen; mood: Mood | null; timer: ReadingTimer }) {
  const inReader = screen === "reader";
  const recap = useMumuRecap({ active: inReader, alarm: timer.alarm });
  // Petting Mumu while it nags is the snooze; "Take a break" in its bubble leaves the reader.
  // Scene reactions only happen in the reader; the recap makes Mumu talk.
  const engine = useMumuEngine({ screen, alarm: timer.alarm, onAlarmPetted: timer.snooze, mood: inReader ? mood : null, speaking: recap.speaking });
  const alarm = timer.alarm ? { limitMinutes: timer.config.limitMinutes, snoozeMinutes: timer.config.snoozeMinutes, onBreak: timer.takeBreak } : null;
  return <MumuStage engine={engine} alarm={alarm} recap={recap.recap ? { recap: recap.recap, onDismiss: recap.dismiss } : null} />;
}

export default function MumuLayer() {
  const { pathname } = useLocation();
  const screen = useMumuScreen();
  const mood = useBridgeMood();
  // The reading timer runs even when Mumu is hidden (F8), so it lives above the early returns. /dev/mumu has its own.
  const timer = useReadingTimer({ inReader: screen === "reader" });
  // Dexie live query: undefined while loading, and until the settings are seeded (B1) the defaults apply.
  const setting = useLiveQuery(() => db.settings.get("mumu"), []);
  const mumu = setting?.key === "mumu" ? setting.value : DEFAULT_SETTINGS.mumu;

  if (pathname.startsWith("/dev/mumu")) return null;
  if (!mumu.visible) return null; // F8 "Hidden": nothing rendered (the reading timer is separate)
  return <MumuActor screen={screen} mood={mood} timer={timer} />;
}
