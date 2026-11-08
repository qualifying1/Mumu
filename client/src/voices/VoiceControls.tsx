// Voice / style / speed / pitch controls + Preview, shared by the Profiles and Cast tabs (SPEC F6).
// Edits are applied to a local draft at once and saved to Dexie 200 ms after the last change (and on leaving),
// so a slider drag isn't fought by the async live query echoing older values back.
import { AVAILABLE_VOICES, type CharacterVoice } from "@mumu/shared";
import { useEffect, useRef, useState } from "react";
import { playPreview, stopPreview } from "../audio/previewPlayer.ts";
import { applyVoiceEdit, PITCH_MAX, PITCH_MIN, sameVoice, SPEED_MAX, SPEED_MIN, SPEED_STEP } from "./voicesModel.ts";

const SAVE_DELAY_MS = 200;

type PreviewState = "idle" | "loading" | "playing";

export interface VoiceControlsProps {
  /** Unique within the page; prefixes the input ids. */
  idPrefix: string;
  value: CharacterVoice;
  /** Persist an edit. Rejects on failure; the message is shown under the controls. */
  onSave(next: CharacterVoice): Promise<void>;
  /** Fetch the clip to play for the current (draft) values. */
  getClip(draft: CharacterVoice): Promise<Blob>;
  previewLabel: string;
}

const FIELD = "min-h-11 w-full border-2 border-current bg-transparent px-2";

export default function VoiceControls({ idPrefix, value, onSave, getClip, previewLabel }: VoiceControlsProps) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState>("idle");

  const committed = useRef(value);
  const pending = useRef<CharacterVoice | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const mounted = useRef(true);

  // A change that did not come from this card (another tab, a reset) replaces the draft.
  useEffect(() => {
    if (!sameVoice(value, committed.current)) {
      committed.current = value;
      setDraft(value);
    }
  }, [value]);

  function flush(): void {
    window.clearTimeout(timer.current);
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    committed.current = next;
    onSaveRef.current(next).then(
      () => {
        if (mounted.current) setError(null);
      },
      (e: unknown) => {
        console.error("[voices] saving an edit failed", e);
        if (mounted.current) setError(e instanceof Error ? e.message : String(e));
      },
    );
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      flush();
      stopPreview();
    };
  }, []);

  function edit(patch: Partial<CharacterVoice>): void {
    let next: CharacterVoice;
    try {
      next = applyVoiceEdit(draft, patch);
    } catch (e) {
      console.error("[voices] rejected an edit", e);
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    setDraft(next);
    pending.current = next;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
  }

  async function onPreview(): Promise<void> {
    if (preview === "playing") {
      stopPreview();
      return;
    }
    setError(null);
    setPreview("loading");
    try {
      const clip = await getClip(draft);
      if (!mounted.current) return;
      setPreview("playing");
      await playPreview(clip);
    } catch (e) {
      console.error("[voices] preview failed", e);
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setPreview("idle");
    }
  }

  const voices: readonly string[] = AVAILABLE_VOICES.includes(draft.voice as (typeof AVAILABLE_VOICES)[number])
    ? AVAILABLE_VOICES
    : [draft.voice, ...AVAILABLE_VOICES];

  return (
    <div className="mt-2 space-y-2 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="font-bold">Voice</span>
          <select id={`${idPrefix}-voice`} className={FIELD} value={draft.voice} onChange={(e) => edit({ voice: e.target.value })}>
            {voices.map((v) => (
              <option key={v} value={v} className="bg-paper text-ink">
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="font-bold">Style</span>
          <input
            id={`${idPrefix}-style`}
            type="text"
            maxLength={120}
            className={FIELD}
            value={draft.style}
            onChange={(e) => edit({ style: e.target.value })}
          />
        </label>
      </div>

      <label className="block">
        <span className="font-bold">Speed</span> <output className="tabular-nums">{draft.speed.toFixed(2)}×</output>
        <input
          id={`${idPrefix}-speed`}
          type="range"
          min={SPEED_MIN}
          max={SPEED_MAX}
          step={SPEED_STEP}
          className="block min-h-11 w-full accent-accent"
          value={draft.speed}
          onChange={(e) => edit({ speed: Number(e.target.value) })}
        />
      </label>
      <label className="block">
        <span className="font-bold">Pitch</span>{" "}
        <output className="tabular-nums">
          {draft.pitch > 0 ? "+" : ""}
          {draft.pitch} st
        </output>
        <input
          id={`${idPrefix}-pitch`}
          type="range"
          min={PITCH_MIN}
          max={PITCH_MAX}
          step={1}
          className="block min-h-11 w-full accent-accent"
          value={draft.pitch}
          onChange={(e) => edit({ pitch: Number(e.target.value) })}
        />
      </label>

      <button
        type="button"
        onClick={() => void onPreview()}
        disabled={preview === "loading"}
        className="min-h-11 w-full bg-accent px-4 font-bold text-on-accent disabled:opacity-60"
      >
        {preview === "loading" ? "Loading…" : preview === "playing" ? "■ Stop" : `▶ ${previewLabel}`}
      </button>
      {error && (
        <p role="alert" className="break-words font-bold">
          {error}
        </p>
      )}
    </div>
  );
}
