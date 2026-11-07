// Sandbox for Mumu at route /dev/mumu. A fake desk (data-mumu-floor) and ledge (data-mumu-ledge)
// stand in for Home so the engine can be watched without the rest of the app.
import { useState } from "react";
import MumuSprite from "./MumuSprite.tsx";
import { ANIM_NAMES, SPRITES } from "./sprites.ts";
import { useMumuEngine } from "./useMumuEngine.ts";

export default function MumuLab() {
  const [calm, setCalm] = useState(false);
  const { state, world, scale, force } = useMumuEngine({ calm });

  return (
    <main className="min-h-screen p-4">
      <h1 className="text-2xl font-bold">MumuLab</h1>
      <p className="text-sm opacity-70">
        Placeholder Mumu on a fake desk. Idle life picks every 4–10 s; yarn only after 20 s without interaction (buttons count as interaction).
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
      </div>

      <pre className="mt-3 text-xs" data-testid="mumu-readout">
        {`anim=${state.anim} frame=${Math.floor(state.animTime * SPRITES[state.anim].fps) % SPRITES[state.anim].frames + 1}/${SPRITES[state.anim].frames}\nx=${Math.round(state.x)} facing=${state.facing} scale=x${scale}\nnext choice in ${Math.max(0, state.nextChoiceIn).toFixed(1)} s · idle ${state.idleFor.toFixed(0)} s`}
      </pre>

      {/* Fake ledge (a shelf plank) */}
      <div data-mumu-ledge className="mt-10 h-3 w-2/3 border-2 bg-current/20" />

      {/* Fake desk */}
      <div data-mumu-floor className="mt-40 h-6 border-t-4 bg-current/10" />

      <MumuSprite anim={state.anim} animTime={state.animTime} facing={state.facing} scale={scale} x={state.x} floorY={world.floorY} />
    </main>
  );
}
