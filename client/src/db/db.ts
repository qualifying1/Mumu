// Client storage schema (CONTRACT §6). Contract-owned: only MAIN changes this file.
// Dexie is the single source of truth for persistent data; React state is for transient UI only.
import type { Character, Cue, Region, VoiceProfile } from "@mumu/shared";
import Dexie, { type EntityTable } from "dexie";

export interface Series {
  id: string;
  title: string;
  coverPageId: string | null;
  createdAt: number;
}

export type ChapterStatus = "imported" | "processing" | "ready" | "failed";

export interface Chapter {
  id: string;
  seriesId: string;
  number: number;
  title: string;
  pageCount: number;
  status: ChapterStatus;
  jobId?: string;
  error?: string;
  /** Scroll position as a page-fraction y (CONTRACT §1), remembered per chapter. */
  lastReadY?: number;
  processedAt?: number;
  recapText?: string;
  recapAudioId?: string;
}

export interface PageRow {
  id: string;
  chapterId: string;
  index: number;
  blob: Blob;
  width: number;
  height: number;
}

export type CueRow = Cue & { chapterId: string };
export type RegionRow = Region & { chapterId: string };

export interface AudioRow {
  id: string;
  chapterId: string;
  blob: Blob;
  durationMs: number;
}

export interface ReadingLogRow {
  /** YYYY-MM-DD, local date */
  date: string;
  seconds: number;
}

// ---- settings: one row per key, value typed by key ----

export interface AudioChannelSetting {
  on: boolean;
  volume: number;
}

export interface SettingsMap {
  theme: "day" | "night" | "system";
  audio: { master: AudioChannelSetting; voices: AudioChannelSetting; music: AudioChannelSetting; sfx: AudioChannelSetting };
  profile: { name: string; avatarBlob?: Blob };
  /** limitMinutes 0 = off */
  wellbeing: { limitMinutes: number; snoozeMinutes: number };
  mumu: { visible: boolean; sounds: boolean };
  debugOverlay: boolean;
}

export type SettingKey = keyof SettingsMap;

export type SettingRow = { [K in SettingKey]: { key: K; value: SettingsMap[K] } }[SettingKey];

export const DEFAULT_SETTINGS: SettingsMap = {
  theme: "system",
  audio: {
    master: { on: true, volume: 1 },
    voices: { on: true, volume: 1 },
    music: { on: true, volume: 0.6 },
    sfx: { on: true, volume: 0.8 },
  },
  profile: { name: "Reader" },
  wellbeing: { limitMinutes: 45, snoozeMinutes: 10 },
  mumu: { visible: true, sounds: true },
  debugOverlay: false,
};

export type MumuDB = Dexie & {
  series: EntityTable<Series, "id">;
  characters: EntityTable<Character, "id">;
  profiles: EntityTable<VoiceProfile, "id">;
  chapters: EntityTable<Chapter, "id">;
  pages: EntityTable<PageRow, "id">;
  cues: EntityTable<CueRow, "id">;
  regions: EntityTable<RegionRow, "id">;
  audio: EntityTable<AudioRow, "id">;
  readingLog: EntityTable<ReadingLogRow, "date">;
  settings: EntityTable<SettingRow, "key">;
};

export const db = new Dexie("mumu") as MumuDB;

db.version(1).stores({
  series: "id, createdAt",
  characters: "id, seriesId",
  profiles: "id, slot",
  chapters: "id, seriesId, [seriesId+number], status",
  pages: "id, chapterId, [chapterId+index]",
  cues: "id, chapterId, [chapterId+order]",
  regions: "id, chapterId",
  audio: "id, chapterId",
  readingLog: "date",
  settings: "key",
});

/** Typed read of one setting; falls back to the documented default (CONTRACT §6) when never saved. */
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingsMap[K]> {
  const row = await db.settings.get(key);
  return row ? (row.value as SettingsMap[K]) : DEFAULT_SETTINGS[key];
}

export async function setSetting<K extends SettingKey>(key: K, value: SettingsMap[K]): Promise<void> {
  await db.settings.put({ key, value } as SettingRow);
}
