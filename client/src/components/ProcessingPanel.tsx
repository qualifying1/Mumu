// Progress screen for one chapter (SPEC F2): a pixel checkbox per JobState, Mumu-voiced messages, a progress bar
// with a small paw walking along it, and Retry on failure.
import { Link } from "react-router";
import { buildSteps, isBusy, viewProgress, type ProcessView, type StepStatus } from "../processing/steps.ts";

const CELLS = 20;

const BOX: Record<StepStatus, string> = { pending: "□", active: "▶", done: "■", failed: "✖" };

function WalkBar({ value }: { value: number }) {
  const filled = Math.round(value * CELLS);
  return (
    <div
      role="progressbar"
      aria-label="Processing progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className="relative mt-3 pt-5"
    >
      <span
        aria-hidden
        className="absolute top-0 -translate-x-1/2 text-sm leading-none transition-[left] duration-150"
        style={{ left: `${Math.max(2, Math.min(98, value * 100))}%` }}
      >
        🐾
      </span>
      <div className="flex gap-0.5">
        {Array.from({ length: CELLS }, (_, i) => (
          <span key={i} className={`h-3 flex-1 ${i < filled ? "bg-accent" : "bg-ink-muted/30"}`} />
        ))}
      </div>
    </div>
  );
}

export interface ProcessingPanelProps {
  title: string;
  view: ProcessView;
  readTo: string;
  onRetry(): void;
  onDismiss(): void;
  /** Disabled while another chapter is being processed. */
  retryDisabled: boolean;
}

export default function ProcessingPanel({ title, view, readTo, onRetry, onDismiss, retryDisabled }: ProcessingPanelProps) {
  const steps = buildSteps(view);
  const progress = viewProgress(view);

  return (
    <section data-testid="processing" aria-label={`Processing ${title}`} className="pixel-frame mx-1 mt-6 bg-paper p-4 text-ink">
      <h2 className="font-title text-xs leading-relaxed">{title}</h2>
      <ol className="mt-3 space-y-2">
        {steps.map((s) => (
          <li key={s.state} data-testid="step" data-status={s.status} className={s.status === "pending" ? "opacity-50" : ""}>
            <span aria-hidden className={`mr-2 inline-block w-4 ${s.status === "failed" ? "text-accent" : ""}`}>
              {BOX[s.status]}
            </span>
            <span className={s.status === "active" ? "font-bold" : ""}>{s.label}</span>
            <span className="sr-only"> ({s.status})</span>
            {s.detail && <p className="ml-6 text-sm text-ink-muted">{s.detail}</p>}
          </li>
        ))}
      </ol>
      <WalkBar value={progress} />

      {view.kind === "failed" && (
        <div role="alert" className="mt-4">
          <p className="font-bold">Mumu hit a snag.</p>
          <p className="mt-1 break-words text-sm">{view.error}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onRetry}
              disabled={retryDisabled}
              className="min-h-11 flex-1 bg-accent px-4 font-bold text-on-accent disabled:opacity-40"
            >
              Retry
            </button>
            <button type="button" onClick={onDismiss} className="pixel-frame min-h-11 px-4">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {view.kind === "done" && (
        <div role="status" className="mt-4">
          <p className="font-bold">Chapter ready! Mumu knows the whole cast now.</p>
          <div className="mt-3 flex gap-2">
            <Link to={readTo} className="flex min-h-11 flex-1 items-center justify-center bg-accent px-4 font-bold text-on-accent">
              Read
            </Link>
            <button type="button" onClick={onDismiss} className="pixel-frame min-h-11 px-4">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {isBusy(view) && <p className="mt-3 text-xs text-ink-muted">You can switch tabs; Mumu keeps working.</p>}
    </section>
  );
}
