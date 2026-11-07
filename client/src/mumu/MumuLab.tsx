// Sandbox for Mumu at route /dev/mumu. A fake desk (data-mumu-floor) and ledge (data-mumu-ledge)
// stand in for Home so the engine can be watched without the rest of the app.
// "Fake reader mode" stands in for the reader: Mumu parks in the corner and the reading timer runs
// with its own limit (the lab never edits settings.wellbeing and never writes the readingLog).
import { useEffect, useState } from "react";
import { db } from "../db/db.ts";
import { notifyActivity, onBreakRequested } from "./bridge.ts";
import MumuStage from "./MumuStage.tsx";
import { localDateKey } from "./readTime.ts";
import { ANIM_NAMES, SPRITES } from "./sprites.ts";
import { useMumuEngine } from "./useMumuEngine.ts";
import { useReadingTimer } from "./useReadingTimer.ts";

export default function MumuLab() {
  const [calm, setCalm] = useState(false);
  const [fakeReader, setFakeReader] = useState(false);
  const [limitMinutes, setLimitMinutes] = useState(1);
  const [snoozeMinutes, setSnoozeMinutes] = useState(1);
  const [breaks, setBreaks] = useState(0);

  const timer = useReadingTimer({ inReader: fakeReader, override: { limitMinutes, snoozeMinutes }, log: false });
  const engine = useMumuEngine({ screen: fakeReader ? "reader" : "home", calm, alarm: timer.alarm });
  const { state, scale, force, goClimb } = engine;

  // The real app navigates Home on "Take a break" (B's callback); the lab leaves its fake reader instead.
  useEffect(
    () =>
      onBreakRequested(() => {
        setBreaks((n) => n + 1);
        setFakeReader(false);
      }),
    [],
  );

  // In fake reader mode any tap or scroll on the page is reading activity, like the real reader reports.
  useEffect(() => {
    if (!fakeReader) return;
    window.addEventListener("pointerdown", notifyActivity);
    window.addEventListener("scroll", notifyActivity, true);
    return () => {
      window.removeEventListener("pointerdown", notifyActivity);
      window.removeEventListener("scroll", notifyActivity, true);
    };
  }, [fakeReader]);

  /** Lab only: put 23 min in today's reading log so the tap bubble has something to say. */
  async function fakeReadingTime(seconds: number) {
    await db.readingLog.put({ date: localDateKey(new Date()), seconds });
  }

  const alarm = timer.alarm ? { limitMinutes, snoozeMinutes, onBreak: timer.takeBreak, onSnooze: timer.snooze } : null;

  return (
    <main className="min-h-screen p-4">
      <h1 className="text-2xl font-bold">MumuLab</h1>
      <p className="text-sm opacity-70">
        Drag Mumu (it swings), drop it under the plank (it hangs) or at a side edge (it climbs), tap it (read time), tap twice or stroke the cursor across it (hearts +
        purr). Idle life picks every 4–10 s; "go climb" after 10 s and yarn after 20 s without interaction. Walking into a side edge climbs to the plank, "calm" turns around
        instead.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {ANIM_NAMES.map((name) => (
          <button key={name} type="button" className="border-2 px-2 py-1 text-sm" onClick={() => force(name)}>
            {name}
          </button>
        ))}
        <button type="button" className="border-2 px-2 py-1 text-sm" onClick={goClimb}>
          go climb (idle choice)
        </button>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={calm} onChange={(e) => setCalm(e.target.checked)} /> calm (other tabs)
        </label>
        <button type="button" className="border-2 px-2 py-1 text-sm" onClick={() => void fakeReadingTime(23 * 60 + 12)}>
          log 23 min today
        </button>
        <button type="button" className="border-2 px-2 py-1 text-sm" onClick={() => void db.readingLog.delete(localDateKey(new Date()))}>
          clear today&apos;s log
        </button>
      </div>

      <fieldset className="mt-3 flex flex-wrap items-center gap-3 border-2 p-2 text-sm">
        <legend className="px-1">Reading timer / alarm</legend>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={fakeReader} onChange={(e) => setFakeReader(e.target.checked)} /> fake reader mode
        </label>
        <label className="flex items-center gap-1">
          limit
          <input type="number" min={0} className="w-14 border-2 px-1" value={limitMinutes} onChange={(e) => setLimitMinutes(Math.max(0, Number(e.target.value)))} /> min (0 = off)
        </label>
        <label className="flex items-center gap-1">
          snooze
          <input type="number" min={1} className="w-14 border-2 px-1" value={snoozeMinutes} onChange={(e) => setSnoozeMinutes(Math.max(1, Number(e.target.value)))} /> min
        </label>
        <button type="button" className="border-2 px-2 py-1" onClick={notifyActivity}>
          poke activity
        </button>
        <button type="button" className="border-2 px-2 py-1" onClick={() => timer.warp(30)}>
          +30 s
        </button>
        <span data-testid="timer-readout">
          session {timer.sessionS} s · alarm {timer.alarm ? "RINGING" : "off"} · breaks requested {breaks}
        </span>
      </fieldset>

      <pre className="mt-3 text-xs" data-testid="mumu-readout">
        {`mode=${state.mode} anim=${state.anim} frame=${(Math.floor(state.animTime * SPRITES[state.anim].fps) % SPRITES[state.anim].frames) + 1}/${SPRITES[state.anim].frames}\nx=${Math.round(state.x)} y=${Math.round(state.y)} facing=${state.facing} scale=x${scale} rot=${state.rotation.toFixed(1)}° purr=${state.purring}\nnext choice in ${Math.max(0, state.nextChoiceIn).toFixed(1)} s · idle ${state.idleFor.toFixed(0)} s`}
      </pre>

      {/* Fake ledge (a shelf plank), full width so the screen edges lead up to it */}
      <div data-mumu-ledge className="-mx-4 mt-24 h-4 border-y-2 bg-current/20" />

      {/* Fake desk */}
      <div data-mumu-floor className="-mx-4 mt-52 h-6 border-t-4 bg-current/10" />

      <MumuStage engine={engine} alarm={alarm} />
    </main>
  );
}
