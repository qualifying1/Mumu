// Sandbox for Mumu at route /dev/mumu. A fake desk (data-mumu-floor) and ledge (data-mumu-ledge)
// stand in for Home so the engine can be watched without the rest of the app.
import { useState } from "react";
import { db } from "../db/db.ts";
import MumuStage from "./MumuStage.tsx";
import { localDateKey } from "./readTime.ts";
import { ANIM_NAMES, SPRITES } from "./sprites.ts";
import { useMumuEngine } from "./useMumuEngine.ts";

export default function MumuLab() {
  const [calm, setCalm] = useState(false);
  const engine = useMumuEngine({ screen: "home", calm });
  const { state, scale, force } = engine;

  /** Lab only: put 23 min in today's reading log so the tap bubble has something to say. */
  async function fakeReadingTime(seconds: number) {
    await db.readingLog.put({ date: localDateKey(new Date()), seconds });
  }

  return (
    <main className="min-h-screen p-4">
      <h1 className="text-2xl font-bold">MumuLab</h1>
      <p className="text-sm opacity-70">
        Drag Mumu (it swings), drop it under the plank (it hangs) or at a side edge (it climbs), tap it (read time), tap twice or stroke the cursor across it (hearts +
        purr). Idle life picks every 4–10 s; yarn only after 20 s without interaction.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {ANIM_NAMES.map((name) => (
          <button key={name} type="button" className="border-2 px-2 py-1 text-sm" onClick={() => force(name)}>
            {name}
          </button>
        ))}
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

      <pre className="mt-3 text-xs" data-testid="mumu-readout">
        {`mode=${state.mode} anim=${state.anim} frame=${(Math.floor(state.animTime * SPRITES[state.anim].fps) % SPRITES[state.anim].frames) + 1}/${SPRITES[state.anim].frames}\nx=${Math.round(state.x)} y=${Math.round(state.y)} facing=${state.facing} scale=x${scale} rot=${state.rotation.toFixed(1)}° purr=${state.purring}\nnext choice in ${Math.max(0, state.nextChoiceIn).toFixed(1)} s · idle ${state.idleFor.toFixed(0)} s`}
      </pre>

      {/* Fake ledge (a shelf plank), full width so the screen edges lead up to it */}
      <div data-mumu-ledge className="-mx-4 mt-24 h-4 border-y-2 bg-current/20" />

      {/* Fake desk */}
      <div data-mumu-floor className="-mx-4 mt-52 h-6 border-t-4 bg-current/10" />

      <MumuStage engine={engine} />
    </main>
  );
}
