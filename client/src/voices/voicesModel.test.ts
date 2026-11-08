import { DEFAULT_PROFILES, VOICE_SLOTS } from "@mumu/shared";
import { describe, expect, it } from "vitest";
import type { CueRow } from "../db/db.ts";
import { applyVoiceEdit, firstStoredLine, groupProfiles, initialOf, PREVIEW_TEXT, profileLabel, sameVoice } from "./voicesModel.ts";

function cue(id: string, chapterId: string, order: number, characterId: string | null, audioId: string | null): CueRow {
  return {
    id,
    chapterId,
    order,
    kind: "speech",
    pageIndex: 0,
    box: { x0: 0.1, y0: 0.1, x1: 0.2, y1: 0.2 },
    text: id,
    characterId,
    emotion: "neutral",
    delivery: "normal",
    audioId,
    sfxTag: null,
  };
}

describe("groupProfiles", () => {
  const groups = groupProfiles(DEFAULT_PROFILES);

  it("groups the 30 profiles into 10 slots of 3, narrator first", () => {
    expect(groups.map((g) => g.slot)).toEqual([...VOICE_SLOTS]);
    expect(groups[0]?.slot).toBe("narrator");
    expect(groups.every((g) => g.profiles.length === 3)).toBe(true);
    expect(groups[0]?.profiles.map((p) => p.id)).toEqual(["narrator_1", "narrator_2", "narrator_3"]);
  });

  it("drops slots that have no profiles", () => {
    expect(groupProfiles(DEFAULT_PROFILES.filter((p) => p.slot === "child")).map((g) => g.slot)).toEqual(["child"]);
  });
});

describe("profileLabel", () => {
  it("shows narrator_1 as Narrator and others by label", () => {
    expect(profileLabel({ id: "narrator_1", label: "Anything" })).toBe("Narrator");
    expect(profileLabel({ id: "male_young_1", label: "Young Hero A" })).toBe("Young Hero A");
  });
});

describe("applyVoiceEdit", () => {
  const base = { voice: "Puck", style: "bright", speed: 1, pitch: 0 };

  it("merges a patch and cleans float noise in speed", () => {
    expect(applyVoiceEdit(base, { speed: 1.05 + 1e-15, pitch: -2 })).toEqual({ ...base, speed: 1.05, pitch: -2 });
  });

  it("rejects out-of-range values loudly", () => {
    expect(() => applyVoiceEdit(base, { speed: 1.5 })).toThrow();
    expect(() => applyVoiceEdit(base, { pitch: 7 })).toThrow();
    expect(() => applyVoiceEdit(base, { pitch: 1.5 })).toThrow();
    expect(() => applyVoiceEdit(base, { voice: "" })).toThrow();
  });

  it("compares voices field by field", () => {
    expect(sameVoice(base, { ...base })).toBe(true);
    expect(sameVoice(base, { ...base, pitch: 1 })).toBe(false);
  });
});

describe("firstStoredLine", () => {
  const chapters = [
    { id: "c2", number: 2 },
    { id: "c1", number: 1 },
  ];
  const cues = [
    cue("late", "c1", 9, "chr_a", "aud_late"),
    cue("silent", "c1", 1, "chr_a", null),
    cue("other", "c1", 2, "chr_b", "aud_other"),
    cue("first", "c1", 4, "chr_a", "aud_first"),
    cue("next-chapter", "c2", 0, "chr_a", "aud_next"),
  ];

  it("picks the earliest chapter, then the lowest order, among voiced cues", () => {
    expect(firstStoredLine("chr_a", chapters, cues)?.id).toBe("first");
  });

  it("falls back to a later chapter when the earlier one has no line", () => {
    expect(firstStoredLine("chr_a", chapters, cues.filter((c) => c.chapterId === "c2"))?.id).toBe("next-chapter");
  });

  it("returns null when the character has no voiced line", () => {
    expect(firstStoredLine("chr_z", chapters, cues)).toBeNull();
    expect(firstStoredLine("chr_a", chapters, [cue("silent", "c1", 1, "chr_a", null)])).toBeNull();
  });
});

describe("misc", () => {
  it("fits the preview endpoint's 200-character limit", () => {
    expect(PREVIEW_TEXT.length).toBeLessThanOrEqual(200);
  });
  it("makes avatar initials", () => {
    expect(initialOf("hero")).toBe("H");
    expect(initialOf("  ")).toBe("?");
  });
});
