// Debug overlay (SPEC F3): cue boxes with order numbers, region boundaries with mood labels, the read line, and an action log.
import { READ_LINE_RATIO } from "./scheduler.ts";
import type { Prepared } from "./prepare.ts";

/** Absolutely positioned inside the strip (position: relative), so it scrolls with the pages. */
export function DebugStripLayer({ prepared }: { prepared: Prepared }) {
  return (
    <div data-testid="debug-strip" className="pointer-events-none absolute inset-0">
      {prepared.regionLines.map((r) => (
        <div key={r.regionId} style={{ top: r.startY }} className="absolute right-0 left-0 border-t-2 border-dashed border-yellow-300">
          <span className="absolute right-0 bg-yellow-300 px-1 text-[11px] font-bold text-black">
            {r.mood} {r.intensity}
          </span>
        </div>
      ))}
      {prepared.cueBoxes.map((b) => (
        <div
          key={b.cueId}
          data-testid="debug-box"
          style={{ left: b.rect.left, top: b.rect.top, width: b.rect.width, height: b.rect.height }}
          className="absolute border-2 border-red-500"
        >
          <span className="absolute -top-0.5 -left-0.5 bg-red-500 px-1 text-[11px] leading-4 font-bold text-white">{b.order}</span>
        </div>
      ))}
    </div>
  );
}

/** Fixed to the viewport: the read line and the last scheduler actions. */
export function DebugViewportLayer({ log, skim }: { log: readonly string[]; skim: boolean }) {
  return (
    <>
      <div
        data-testid="debug-readline"
        style={{ top: `${READ_LINE_RATIO * 100}%` }}
        className="pointer-events-none fixed right-0 left-0 z-30 border-t-2 border-cyan-300"
      >
        <span className="absolute left-0 bg-cyan-300 px-1 text-[11px] font-bold text-black">read line{skim ? " · skim" : ""}</span>
      </div>
      <ol
        data-testid="debug-log"
        className="pointer-events-none fixed bottom-16 left-1 z-30 max-w-[70vw] bg-black/70 p-1 font-mono text-[11px] leading-4 text-green-300"
      >
        {log.length === 0 ? <li>(no audio events yet)</li> : log.map((line, i) => <li key={i}>{line}</li>)}
      </ol>
    </>
  );
}
