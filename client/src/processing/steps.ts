// Pure view model for the processing screen (SPEC F2): one pixel step per JobState, written in Mumu's voice.
import type { JobState } from "@mumu/shared";

/** The states shown as steps. `done` and `failed` are outcomes, not steps. */
export const STEP_STATES = ["queued", "slicing", "analyzing", "reasoning", "casting", "voicing", "packaging"] as const;
export type StepState = (typeof STEP_STATES)[number];

export const STEP_LABELS: Record<StepState, string> = {
  queued: "Mumu is waiting in line…",
  slicing: "Mumu is flipping through the pages…",
  analyzing: "Mumu is reading the panels…",
  reasoning: "Mumu is working out who's who…",
  casting: "Mumu is picking the voices…",
  voicing: "Mumu is warming up the cast…",
  packaging: "Mumu is wrapping it all up…",
};

/** What the client is doing, from picking up the pages to storing the package. */
export type ProcessView =
  | { kind: "preparing"; message: string }
  | { kind: "running"; state: StepState; progress: number; message: string }
  | { kind: "storing" }
  | { kind: "done" }
  | { kind: "failed"; error: string; atState: StepState | null };

export type StepStatus = "pending" | "active" | "done" | "failed";

export interface StepRow {
  state: StepState;
  label: string;
  status: StepStatus;
  /** The server's (or client's) latest message, shown under the active step. */
  detail?: string;
}

export function isStepState(state: JobState): state is StepState {
  return (STEP_STATES as readonly string[]).includes(state);
}

/** Rows for the progress screen. Steps before the current one are checked; `failed` marks the step that was active. */
export function buildSteps(view: ProcessView): StepRow[] {
  const rows = (activeIndex: number, status: "active" | "failed", detail?: string): StepRow[] =>
    STEP_STATES.map((state, i) => {
      const row: StepRow = {
        state,
        label: STEP_LABELS[state],
        status: i < activeIndex ? "done" : i === activeIndex ? status : "pending",
      };
      if (i === activeIndex && detail) row.detail = detail;
      return row;
    });

  switch (view.kind) {
    case "preparing":
      return rows(0, "active", view.message);
    case "running":
      return rows(STEP_STATES.indexOf(view.state), "active", view.message);
    case "storing":
      return rows(STEP_STATES.length - 1, "active", "Mumu is putting everything on the shelf…");
    case "done":
      return STEP_STATES.map((state) => ({ state, label: STEP_LABELS[state], status: "done" as const }));
    case "failed":
      return rows(view.atState ? STEP_STATES.indexOf(view.atState) : 0, "failed");
  }
}

/** 0..1 for the progress bar. The server's progress covers the job; preparing and storing sit at the ends. */
export function viewProgress(view: ProcessView): number {
  switch (view.kind) {
    case "preparing":
      return 0;
    case "running":
      return Math.min(0.99, Math.max(0, view.progress));
    case "storing":
      return 0.99;
    case "done":
      return 1;
    case "failed":
      return 0;
  }
}

export function isBusy(view: ProcessView | undefined): boolean {
  return view !== undefined && (view.kind === "preparing" || view.kind === "running" || view.kind === "storing");
}
