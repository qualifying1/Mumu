// Reader audio scheduler (SPEC F4). PURE: (config, state, input) → state + actions. No Howler, no DOM, no clock.
// The thin adapter in screens/Reader.tsx feeds it scroll positions and executes its actions through the audio engine.
import type { Cue, CueKind, Mood, Region, SfxTag } from "@mumu/shared";
import { anchorY, regionBounds, type StripLayout } from "./coords.ts";

// ---- SPEC F4 numbers ----
/** The read line sits this far down the viewport. */
export const READ_LINE_RATIO = 0.6;
/** Skim mode turns on above this scroll speed, in viewport heights per second. */
export const SKIM_VIEWPORTS_PER_SECOND = 1.5;
/** Skim mode turns off after this long below the threshold. */
export const SKIM_OFF_MS = 400;
/** Waiting voice cues (the one playing is not counted). Beyond this the oldest is dropped. */
export const MAX_VOICE_QUEUE = 3;
export const MAX_SFX_AT_ONCE = 2;
export const VOICE_FADE_OUT_MS = 150;
/** Scroll events closer together than this are treated as this far apart, so a burst can't fake a flick. */
export const MIN_SCROLL_DT_MS = 16;

export interface SchedCue {
  id: string;
  order: number;
  /** Strip px of the box's vertical centre. */
  anchorY: number;
  kind: CueKind;
  audioId: string | null;
  sfxTag: SfxTag | null;
}

export interface SchedRegion {
  id: string;
  startY: number;
  endY: number;
  mood: Mood;
}

export interface SchedConfig {
  cues: readonly SchedCue[];
  regions: readonly SchedRegion[];
  viewportHeight: number;
}

export interface QueuedVoice {
  cueId: string;
  audioId: string;
}

export interface SchedState {
  lastY: number;
  lastT: number;
  lastFastT: number | null;
  skim: boolean;
  /** Cue ids already fired or skipped this reading session. Nothing in here ever plays again. */
  done: ReadonlySet<string>;
  current: QueuedVoice | null;
  fading: boolean;
  queue: readonly QueuedVoice[];
  sfxActive: number;
  regionId: string | null;
  mood: Mood | null;
}

export type SchedInput =
  | { type: "scroll"; t: number; y: number }
  | { type: "voiceEnded" }
  | { type: "sfxEnded" };

export type SkipReason = "skim" | "sfx-limit" | "no-sound";

export type SchedAction =
  | { type: "playVoice"; cueId: string; audioId: string }
  | { type: "fadeOutVoice"; ms: number }
  | { type: "playSfx"; cueId: string; tag: SfxTag }
  | { type: "duck"; on: boolean }
  /** The region at the read line changed. The adapter calls the Mumu bridge and crossfades the music. */
  | { type: "regionChange"; regionId: string; mood: Mood }
  // Informational: nothing to execute, shown in the debug log.
  | { type: "skipped"; cueId: string; reason: SkipReason }
  | { type: "queued"; cueId: string }
  | { type: "dropped"; cueId: string };

export interface StepResult {
  state: SchedState;
  actions: SchedAction[];
}

/** Build the scheduler config from stored rows and the current strip layout. */
export function buildConfig(
  layout: StripLayout,
  cues: readonly Cue[],
  regions: readonly Region[],
  viewportHeight: number,
): SchedConfig {
  return {
    cues: cues.map((c) => ({
      id: c.id,
      order: c.order,
      anchorY: anchorY(layout, c.pageIndex, c.box),
      kind: c.kind,
      audioId: c.audioId,
      sfxTag: c.sfxTag,
    })),
    regions: regions.map((r) => ({ id: r.id, mood: r.mood, ...regionBounds(layout, r) })),
    viewportHeight,
  };
}

export function regionAt(regions: readonly SchedRegion[], y: number): SchedRegion | null {
  const last = regions[regions.length - 1];
  for (const r of regions) {
    const inside = y >= r.startY && (y < r.endY || (r === last && y <= r.endY));
    if (inside) return r;
  }
  return null;
}

/**
 * Start (or restart) a reading session at read-line position `y`.
 * Cues already above `y` count as done, so restoring a saved position or scrolling back up never plays them.
 * Returns the region actions for the starting position.
 */
export function startSession(config: SchedConfig, y: number, t: number): StepResult {
  const done = new Set<string>();
  for (const c of config.cues) if (c.anchorY <= y) done.add(c.id);
  const state: SchedState = {
    lastY: y,
    lastT: t,
    lastFastT: null,
    skim: false,
    done,
    current: null,
    fading: false,
    queue: [],
    sfxActive: 0,
    regionId: null,
    mood: null,
  };
  const actions: SchedAction[] = [];
  const next = enterRegion(config, state, y, actions);
  return { state: next, actions };
}

function enterRegion(config: SchedConfig, state: SchedState, y: number, actions: SchedAction[]): SchedState {
  const region = regionAt(config.regions, y);
  if (!region || region.id === state.regionId) return state;
  actions.push({ type: "regionChange", regionId: region.id, mood: region.mood });
  return { ...state, regionId: region.id, mood: region.mood };
}

export function step(config: SchedConfig, state: SchedState, input: SchedInput): StepResult {
  switch (input.type) {
    case "scroll":
      return onScroll(config, state, input.t, input.y);
    case "voiceEnded":
      return onVoiceEnded(state);
    case "sfxEnded":
      return { state: { ...state, sfxActive: Math.max(0, state.sfxActive - 1) }, actions: [] };
  }
}

function onScroll(config: SchedConfig, prev: SchedState, t: number, y: number): StepResult {
  const actions: SchedAction[] = [];

  // Skim mode: fast scrolling turns it on; it turns off after SKIM_OFF_MS below the threshold.
  const dtMs = Math.max(t - prev.lastT, MIN_SCROLL_DT_MS);
  const speed = (Math.abs(y - prev.lastY) / dtMs) * 1000;
  const fast = speed > SKIM_VIEWPORTS_PER_SECOND * config.viewportHeight;
  const lastFastT = fast ? t : prev.lastFastT;
  const skim = fast || (prev.skim && lastFastT !== null && t - lastFastT < SKIM_OFF_MS);

  let state: SchedState = { ...prev, lastY: y, lastT: t, lastFastT, skim };

  // Cues whose anchor the read line just crossed moving down. Scrolling up crosses nothing.
  if (y > prev.lastY) {
    const crossed = config.cues
      .filter((c) => !state.done.has(c.id) && c.anchorY > prev.lastY && c.anchorY <= y)
      .sort((a, b) => a.order - b.order);
    if (crossed.length > 0) {
      const done = new Set(state.done);
      for (const cue of crossed) {
        done.add(cue.id);
        state = fire(state, cue, skim, actions);
      }
      state = { ...state, done };
    }
  }

  state = enterRegion(config, state, y, actions);
  return { state, actions };
}

function fire(state: SchedState, cue: SchedCue, skim: boolean, actions: SchedAction[]): SchedState {
  if (skim) {
    actions.push({ type: "skipped", cueId: cue.id, reason: "skim" });
    return state;
  }

  if (cue.kind === "sfx") {
    if (cue.sfxTag === null) {
      actions.push({ type: "skipped", cueId: cue.id, reason: "no-sound" });
      return state;
    }
    if (state.sfxActive >= MAX_SFX_AT_ONCE) {
      actions.push({ type: "skipped", cueId: cue.id, reason: "sfx-limit" });
      return state;
    }
    actions.push({ type: "playSfx", cueId: cue.id, tag: cue.sfxTag });
    return { ...state, sfxActive: state.sfxActive + 1 };
  }

  if (cue.audioId === null) {
    actions.push({ type: "skipped", cueId: cue.id, reason: "no-sound" });
    return state;
  }
  return enqueueVoice(state, { cueId: cue.id, audioId: cue.audioId }, actions);
}

function enqueueVoice(state: SchedState, voice: QueuedVoice, actions: SchedAction[]): SchedState {
  if (state.current === null) {
    actions.push({ type: "playVoice", ...voice });
    actions.push({ type: "duck", on: true });
    return { ...state, current: voice };
  }

  const queue = [...state.queue, voice];
  while (queue.length > MAX_VOICE_QUEUE) {
    const dropped = queue.shift()!;
    actions.push({ type: "dropped", cueId: dropped.cueId });
  }
  actions.push({ type: "queued", cueId: voice.cueId });

  // A full queue means we are falling behind: fade the current clip so the backlog drains.
  let fading = state.fading;
  if (queue.length >= MAX_VOICE_QUEUE && !fading) {
    actions.push({ type: "fadeOutVoice", ms: VOICE_FADE_OUT_MS });
    fading = true;
  }
  return { ...state, queue, fading };
}

function onVoiceEnded(state: SchedState): StepResult {
  const actions: SchedAction[] = [];
  const [next, ...rest] = state.queue;
  if (next) {
    actions.push({ type: "playVoice", ...next });
    return { state: { ...state, current: next, queue: rest, fading: false }, actions };
  }
  if (state.current !== null) actions.push({ type: "duck", on: false });
  return { state: { ...state, current: null, queue: [], fading: false }, actions };
}
