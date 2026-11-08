import type { ChapterProgress } from "../pipeline/chapter.js";

// Share of the 0..1 bar each stage covers. Analyzing and voicing are the long ones and report counts.
const STAGE_START = { slicing: 0, analyzing: 0.05, reasoning: 0.4, casting: 0.55, voicing: 0.6, packaging: 0.97 } as const;
const STAGE_END = { slicing: 0.05, analyzing: 0.4, reasoning: 0.55, casting: 0.6, voicing: 0.97, packaging: 1 } as const;

/** Progress 0..1 for a pipeline progress event. Never reaches 1 before the job is done. */
export function progressFraction(p: ChapterProgress): number {
  if (p.state === "queued") return 0;
  if (p.state === "done") return 1;
  if (p.state === "failed") throw new Error("progressFraction: failed is not a pipeline stage");
  const start = STAGE_START[p.state];
  const end = STAGE_END[p.state];
  if (p.done !== undefined && p.total !== undefined && p.total > 0) {
    const frac = Math.min(1, Math.max(0, p.done / p.total));
    return Math.min(0.99, start + (end - start) * frac);
  }
  return start;
}
