// The reader's floating mini-bar (DESIGN: back, master toggle, layer toggles, mood chip). Auto-hides on scroll.
import type { Mood } from "@mumu/shared";
import { useState } from "react";
import type { AudioSettings } from "../audio/volumes.ts";

type Channel = keyof AudioSettings;

const CHANNELS: { key: Channel; label: string; title: string }[] = [
  { key: "master", label: "All", title: "Master" },
  { key: "voices", label: "Voice", title: "Voices" },
  { key: "music", label: "Music", title: "Music" },
  { key: "sfx", label: "SFX", title: "Sound effects" },
];

interface Props {
  visible: boolean;
  audio: AudioSettings;
  mood: Mood | null;
  debug: boolean;
  onBack: () => void;
  onChangeChannel: (key: Channel, value: { on: boolean; volume: number }) => void;
  onToggleDebug: () => void;
}

export default function MiniBar({ visible, audio, mood, debug, onBack, onChangeChannel, onToggleDebug }: Props) {
  const [panel, setPanel] = useState(false);
  const shown = visible || panel;

  return (
    <div
      data-testid="mini-bar"
      style={{ transform: shown ? "translateY(0)" : "translateY(-110%)" }}
      className="fixed top-0 right-0 left-0 z-40 border-b-4 border-current bg-black/90 text-white transition-transform duration-150"
    >
      <div className="flex items-center gap-1 p-1">
        <button type="button" aria-label="Back" onClick={onBack} className="min-h-[44px] min-w-[44px] border-2 border-current px-2 font-bold">
          ←
        </button>
        {CHANNELS.map(({ key, label, title }) => (
          <button
            key={key}
            type="button"
            aria-label={`${title} ${audio[key].on ? "on" : "off"}`}
            aria-pressed={audio[key].on}
            data-testid={`toggle-${key}`}
            onClick={() => onChangeChannel(key, { ...audio[key], on: !audio[key].on })}
            className={`min-h-[44px] min-w-[44px] border-2 border-current px-1 text-xs font-bold ${audio[key].on ? "" : "line-through opacity-50"}`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          aria-label="Volume and debug settings"
          aria-expanded={panel}
          onClick={() => setPanel((p) => !p)}
          className="min-h-[44px] min-w-[44px] border-2 border-current px-2 font-bold"
        >
          ⚙
        </button>
        <span data-testid="mood-chip" className="ml-auto truncate border-2 border-current px-2 text-xs">
          {mood ?? "—"}
        </span>
      </div>

      {panel && (
        <div className="space-y-1 border-t-2 border-current p-2">
          {CHANNELS.map(({ key, title }) => (
            <label key={key} className="flex min-h-[44px] items-center gap-2 text-sm">
              <span className="w-24">{title}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={audio[key].volume}
                aria-label={`${title} volume`}
                onChange={(e) => onChangeChannel(key, { ...audio[key], volume: Number(e.target.value) })}
                className="flex-1"
              />
              <span className="w-10 text-right">{Math.round(audio[key].volume * 100)}</span>
            </label>
          ))}
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input type="checkbox" checked={debug} onChange={onToggleDebug} className="size-5" />
            Debug overlay
          </label>
        </div>
      )}
    </div>
  );
}
