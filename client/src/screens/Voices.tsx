// Voices tab (SPEC F6): Profiles | Cast. Edits save immediately and only affect characters created afterwards
// (profiles) or future chapters (cast). A chapter is voiced once, so there is no re-voice button.
import type { Character, VoiceProfile } from "@mumu/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { getApi } from "../api/client.ts";
import { db } from "../db/db.ts";
import VoiceControls from "../voices/VoiceControls.tsx";
import {
  firstStoredLine,
  groupProfiles,
  initialOf,
  PREVIEW_TEXT,
  profileLabel,
} from "../voices/voicesModel.ts";

type Tab = "profiles" | "cast";

function SegmentedTabs({ tab, onChange }: { tab: Tab; onChange(tab: Tab): void }) {
  const items: { id: Tab; label: string }[] = [
    { id: "profiles", label: "Profiles" },
    { id: "cast", label: "Cast" },
  ];
  return (
    <div role="tablist" aria-label="Voices" className="pixel-frame mx-1 mt-4 flex bg-paper text-ink">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={tab === item.id}
          onClick={() => onChange(item.id)}
          className={`min-h-11 flex-1 px-3 ${tab === item.id ? "bg-accent font-bold text-on-accent" : ""}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function ProfileCard({ profile }: { profile: VoiceProfile }) {
  const label = profileLabel(profile);
  return (
    <li data-testid="profile-card" data-profile-id={profile.id} className="pixel-frame mx-1 mt-5 bg-paper p-3 text-ink">
      <h3 className="flex items-center gap-2 font-bold">
        {profile.id === "narrator_1" && (
          <span aria-hidden className="inline-block bg-wood-dark px-1 text-on-accent">
            🎙
          </span>
        )}
        {label}
      </h3>
      <VoiceControls
        idPrefix={profile.id}
        value={{ voice: profile.voice, style: profile.style, speed: profile.speed, pitch: profile.pitch }}
        previewLabel="Preview"
        onSave={async (next) => {
          await db.profiles.update(profile.id, next);
        }}
        getClip={(draft) => getApi().previewVoice({ ...profile, ...draft }, PREVIEW_TEXT)}
      />
    </li>
  );
}

function ProfilesTab() {
  const profiles = useLiveQuery(() => db.profiles.toArray(), []);
  if (!profiles) return null;
  const groups = groupProfiles(profiles);
  return (
    <div>
      <p className="mx-1 mt-4 text-sm text-ink-muted">
        New characters copy a profile's voice once, when Mumu meets them. Tuning a profile never changes existing characters or audio
        that is already made.
      </p>
      {groups.map((g) => (
        <section key={g.slot} aria-labelledby={`slot-${g.slot}`}>
          <h2 id={`slot-${g.slot}`} className="mx-1 mt-6 font-title text-xs">
            {g.title}
          </h2>
          <ul>
            {g.profiles.map((p) => (
              <ProfileCard key={p.id} profile={p} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function CharacterCard({ character }: { character: Character }) {
  async function firstLineClip(): Promise<Blob> {
    const chapters = await db.chapters.where("seriesId").equals(character.seriesId).toArray();
    const cues = await db.cues
      .where("chapterId")
      .anyOf(chapters.map((c) => c.id))
      .filter((c) => c.characterId === character.id)
      .toArray();
    const line = firstStoredLine(character.id, chapters, cues);
    if (!line?.audioId) throw new Error(`${character.name} has no voiced line stored yet.`);
    const audio = await db.audio.get(line.audioId);
    if (!audio) throw new Error(`The stored audio for ${character.name}'s first line (${line.audioId}) is missing.`);
    return audio.blob;
  }

  return (
    <li data-testid="cast-card" data-character-id={character.id} className="pixel-frame mx-1 mt-5 bg-paper p-3 text-ink">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="pixel-frame flex size-12 shrink-0 items-center justify-center bg-wood-light font-title text-on-accent"
        >
          {initialOf(character.name)}
        </span>
        <div className="min-w-0">
          <h3 className="font-bold">{character.name}</h3>
          <p className="text-sm text-ink-muted">{character.description}</p>
        </div>
      </div>
      <VoiceControls
        idPrefix={character.id}
        value={character.voice}
        previewLabel="First line"
        onSave={async (next) => {
          await db.characters.update(character.id, { voice: next });
        }}
        getClip={firstLineClip}
      />
      <p className="mt-2 text-xs text-ink-muted">Applies to future chapters only. Audio that is already made stays as it is.</p>
    </li>
  );
}

function CastTab() {
  const series = useLiveQuery(() => db.series.orderBy("createdAt").toArray(), []);
  const characters = useLiveQuery(() => db.characters.toArray(), []);
  const [picked, setPicked] = useState<string | null>(null);
  if (!series || !characters) return null;

  const withCast = series.filter((s) => characters.some((c) => c.seriesId === s.id));
  const seriesId = picked !== null && withCast.some((s) => s.id === picked) ? picked : (withCast[0]?.id ?? null);
  if (seriesId === null) {
    return (
      <p role="status" className="pixel-frame mx-1 mt-8 bg-paper p-4 text-center text-ink">
        Process a chapter so Mumu can meet the cast
      </p>
    );
  }
  const cast = characters.filter((c) => c.seriesId === seriesId);

  return (
    <div>
      <label className="mx-1 mt-4 block text-sm font-bold" htmlFor="cast-series">
        Series
      </label>
      <select
        id="cast-series"
        className="mx-1 mt-1 min-h-11 w-[calc(100%-0.5rem)] border-2 border-current bg-transparent px-2"
        value={seriesId}
        onChange={(e) => setPicked(e.target.value)}
      >
        {withCast.map((s) => (
          <option key={s.id} value={s.id} className="bg-paper text-ink">
            {s.title}
          </option>
        ))}
      </select>
      <ul>
        {cast.map((c) => (
          <CharacterCard key={c.id} character={c} />
        ))}
      </ul>
    </div>
  );
}

export default function Voices() {
  const [tab, setTab] = useState<Tab>("profiles");
  return (
    <main className="mx-auto max-w-xl p-6 pb-24">
      <h1 className="text-2xl font-bold">Voices</h1>
      <SegmentedTabs tab={tab} onChange={setTab} />
      {tab === "profiles" ? <ProfilesTab /> : <CastTab />}
    </main>
  );
}
