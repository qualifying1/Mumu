import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AVAILABLE_VOICES,
  ChapterPackageSchema,
  DEFAULT_PROFILES,
  CharacterSchema,
  VOICE_SLOTS,
  VoiceProfileSchema,
  snapshotVoice,
} from "./index.js";

const samplePath = resolve(__dirname, "../../fixtures/sample.json");

describe("fixtures/sample.json", () => {
  const raw: unknown = JSON.parse(readFileSync(samplePath, "utf8"));

  it("parses as a ChapterPackage", () => {
    const pkg = ChapterPackageSchema.parse(raw);
    expect(pkg.cues.length).toBeGreaterThanOrEqual(6);
    expect(pkg.regions).toHaveLength(2);
    expect(pkg.recap.text.length).toBeGreaterThan(0);
  });

  it("ships real MP3 data for every voiced cue", () => {
    const pkg = ChapterPackageSchema.parse(raw);
    for (const clip of pkg.audio) {
      const bytes = Buffer.from(clip.dataBase64, "base64");
      expect(bytes.length).toBeGreaterThan(500);
    }
    expect(pkg.cues.filter((c) => c.kind === "sfx").every((c) => c.audioId === null)).toBe(true);
  });

  it("rejects a wrong contractVersion", () => {
    expect(() => ChapterPackageSchema.parse({ ...(raw as object), contractVersion: 2 })).toThrow();
  });

  it("rejects a cue that points at missing audio", () => {
    const pkg = ChapterPackageSchema.parse(raw);
    const broken = { ...pkg, cues: [{ ...pkg.cues[0]!, audioId: "nope" }, ...pkg.cues.slice(1)] };
    expect(() => ChapterPackageSchema.parse(broken)).toThrow(/no audio clip nope/);
  });
});

describe("default voice profiles", () => {
  it("has 3 profiles per slot (30) with ids <slot>_<n>", () => {
    expect(DEFAULT_PROFILES).toHaveLength(30);
    const ids = new Set(DEFAULT_PROFILES.map((p) => p.id));
    expect(ids.size).toBe(30);
    for (const slot of VOICE_SLOTS) {
      for (const n of [1, 2, 3]) expect(ids.has(`${slot}_${n}`)).toBe(true);
    }
  });

  it("validates, uses listed voices, and labels narrator_1 'Narrator' (not Mumu)", () => {
    for (const p of DEFAULT_PROFILES) {
      expect(() => VoiceProfileSchema.parse(p)).not.toThrow();
      expect(AVAILABLE_VOICES).toContain(p.voice);
    }
    expect(DEFAULT_PROFILES.find((p) => p.id === "narrator_1")?.label).toBe("Narrator");
  });
});

describe("character voice snapshot", () => {
  const profile = DEFAULT_PROFILES.find((p) => p.id === "male_young_2")!;
  const base = {
    id: "chr_a",
    seriesId: "s",
    name: "A",
    description: "d",
    voiceSlot: "male_young",
    profileId: profile.id,
    firstSeenChapterId: "c",
  };

  it("copies voice, style, speed and pitch from the profile, and nothing else", () => {
    expect(snapshotVoice(profile)).toEqual({
      voice: profile.voice,
      style: profile.style,
      speed: profile.speed,
      pitch: profile.pitch,
    });
  });

  it("requires a valid voice on every Character", () => {
    expect(() => CharacterSchema.parse({ ...base, voice: snapshotVoice(profile) })).not.toThrow();
    expect(() => CharacterSchema.parse(base)).toThrow();
    expect(() => CharacterSchema.parse({ ...base, voice: { ...snapshotVoice(profile), pitch: 9 } })).toThrow();
  });
});
