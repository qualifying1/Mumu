// Mumu bridge (CONTRACT §10): the only way Lane B talks to Lane C.
// The exported API is part of the contract. Lane C may change internals, not signatures.
import type { Mood } from "@mumu/shared";

export type Screen = "home" | "reader" | "other";

export interface Recap {
  text: string;
  audioUrl: string;
}

export type BridgeEvent =
  | { type: "screen"; screen: Screen }
  | { type: "mood"; mood: Mood | null }
  | { type: "activity" }
  | { type: "recap"; recap: Recap };

export type BridgeListener = (event: BridgeEvent) => void;

const listeners = new Set<BridgeListener>();
const breakCallbacks = new Set<() => void>();

function emit(event: BridgeEvent): void {
  for (const l of [...listeners]) l(event);
}

// ---- called by B ----

export function setScreen(screen: Screen): void {
  emit({ type: "screen", screen });
}

/** The region mood at the read line; `null` outside the reader. */
export function setMood(mood: Mood | null): void {
  emit({ type: "mood", mood });
}

/** Call on each scroll or tap in the reader (feeds the reading timer's idle detection). */
export function notifyActivity(): void {
  emit({ type: "activity" });
}

/** Mumu presents the previous chapter's recap when a chapter N > 1 opens. */
export function showRecap(recap: Recap): void {
  emit({ type: "recap", recap });
}

/** Mumu's "Take a break" button asks the app to leave the reader. Returns an unsubscribe function. */
export function onBreakRequested(cb: () => void): () => void {
  breakCallbacks.add(cb);
  return () => {
    breakCallbacks.delete(cb);
  };
}

// ---- called by C ----

/** MumuLayer listens to everything above. Returns an unsubscribe function. */
export function subscribe(listener: BridgeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** C calls this when the user presses "Take a break". */
export function requestBreak(): void {
  for (const cb of [...breakCallbacks]) cb();
}
