// Pure helpers for the Voices tab (SPEC F6): grouping, validation of edits, and the Cast tab's "first stored line".
import { CharacterVoiceSchema, VOICE_SLOTS, type CharacterVoice, type VoiceProfile, type VoiceSlot } from "@mumu/shared";
import type { Chapter, CueRow } from "../db/db.ts";

/** The fixed sample line for profile previews (POST /preview allows ≤ 200 chars). */
export const PREVIEW_TEXT = "The moon is bright tonight. Shall we begin?";

export const SPEED_MIN = 0.8;
export const SPEED_MAX = 1.2;
export const SPEED_STEP = 0.05;
export const PITCH_MIN = -6;
export const PITCH_MAX = 6;

export const SLOT_TITLES: Record<VoiceSlot, string> = {
  narrator: "Narrator",
  male_young: "Young man",
  male_adult: "Grown man",
  male_deep: "Deep voice",
  male_elder: "Old man",
  female_young: "Young woman",
  female_adult: "Grown woman",
  female_cold: "Cold woman",
  female_elder: "Old woman",
  child: "Child",
};

export interface SlotGroup {
  slot: VoiceSlot;
  title: string;
  profiles: VoiceProfile[];
}

/** Profiles grouped by slot in roster order (the narrator slot first, so "Narrator" is pinned at the top). */
export function groupProfiles(profiles: readonly VoiceProfile[]): SlotGroup[] {
  return VOICE_SLOTS.map((slot) => ({
    slot,
    title: SLOT_TITLES[slot],
    profiles: profiles.filter((p) => p.slot === slot).sort((a, b) => a.id.localeCompare(b.id)),
  })).filter((g) => g.profiles.length > 0);
}

/** `narrator_1` is shown as "Narrator" (it is not Mumu). */
export function profileLabel(profile: Pick<VoiceProfile, "id" | "label">): string {
  return profile.id === "narrator_1" ? "Narrator" : profile.label;
}

/** Speed slider values are multiples of 0.05; keep them free of float noise (1.0500000000000003). */
export function roundSpeed(speed: number): number {
  return Math.round(speed * 100) / 100;
}

/** Apply an edit to a voice and validate the result against the shared schema (range checks included). */
export function applyVoiceEdit(current: CharacterVoice, patch: Partial<CharacterVoice>): CharacterVoice {
  const next = { ...current, ...patch };
  return CharacterVoiceSchema.parse({ ...next, speed: roundSpeed(next.speed) });
}

export function sameVoice(a: CharacterVoice, b: CharacterVoice): boolean {
  return a.voice === b.voice && a.style === b.style && a.speed === b.speed && a.pitch === b.pitch;
}

/**
 * The first line a character speaks that has stored audio: earliest chapter (by number), then reading `order`.
 * Returns null when they have no voiced cue yet.
 */
export function firstStoredLine(
  characterId: string,
  chapters: readonly Pick<Chapter, "id" | "number">[],
  cues: readonly CueRow[],
): CueRow | null {
  const chapterNumber = new Map(chapters.map((c) => [c.id, c.number]));
  let best: CueRow | null = null;
  for (const cue of cues) {
    if (cue.characterId !== characterId || cue.audioId === null) continue;
    const n = chapterNumber.get(cue.chapterId);
    if (n === undefined) continue;
    if (best === null) {
      best = cue;
      continue;
    }
    const bestN = chapterNumber.get(best.chapterId)!;
    if (n < bestN || (n === bestN && cue.order < best.order)) best = cue;
  }
  return best;
}

/** Avatar letter for a character card. */
export function initialOf(name: string): string {
  const first = [...name.trim()][0];
  return first ? first.toUpperCase() : "?";
}
