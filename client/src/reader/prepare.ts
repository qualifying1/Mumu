// Turns stored rows + a strip layout into everything the reader draws or schedules. Pure.
// Errors (a cue pointing at a page that doesn't exist, ...) come back as a message instead of crashing the render.
import type { Cue, Mood, Region } from "@mumu/shared";
import { boxToRect, pageYToStrip, regionBounds, type Rect, type StripLayout } from "./coords.ts";
import { buildConfig, type SchedConfig } from "./scheduler.ts";

export interface CueBox {
  cueId: string;
  order: number;
  rect: Rect;
}

export interface RegionLine {
  regionId: string;
  mood: Mood;
  intensity: number;
  startY: number;
  endY: number;
}

export interface Prepared {
  config: SchedConfig;
  cueBoxes: CueBox[];
  regionLines: RegionLine[];
}

export function prepareReader(
  layout: StripLayout,
  cues: readonly Cue[],
  regions: readonly Region[],
  viewportHeight: number,
): { ok: true; prepared: Prepared } | { ok: false; error: string } {
  try {
    const config = buildConfig(layout, cues, regions, viewportHeight);
    const cueBoxes = cues.map((c) => ({ cueId: c.id, order: c.order, rect: boxToRect(layout, c.pageIndex, c.box) }));
    const regionLines = regions.map((r) => ({
      regionId: r.id,
      mood: r.mood,
      intensity: r.intensity,
      ...regionBounds(layout, r),
    }));
    // touch every region start so a bad pageIndex is reported here, not in a render
    for (const r of regions) pageYToStrip(layout, r.start.pageIndex, r.start.y);
    return { ok: true, prepared: { config, cueBoxes, regionLines } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
