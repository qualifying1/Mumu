import { DEFAULT_PROFILES, type Character, type Cue } from "@mumu/shared";
import { describe, expect, it } from "vitest";
import { characterStyle, hasSpeakableText, narrationStyle, resolveCueVoice } from "./tts.js";

type CueLike = Pick<Cue, "id" | "kind" | "characterId" | "emotion" | "delivery">;
const cue = (over: Partial<CueLike> = {}): CueLike => ({ id: "cue_1", kind: "speech", characterId: null, emotion: "neutral", delivery: "normal", ...over });

const hero: Character = {
  id: "chr_hero",
  seriesId: "s",
  name: "Hero",
  description: "d",
  voiceSlot: "male_young",
  profileId: "male_young_1",
  // A snapshot that differs from the live profile table on purpose.
  voice: { voice: "Fenrir", style: "snapshot style", speed: 1.1, pitch: 2 },
  firstSeenChapterId: "c1",
};

describe("style string (PROMPTS §3)", () => {
  it("joins style, emotion and delivery, omitting an empty delivery", () => {
    expect(characterStyle({ style: "bright, lively" }, cue({ emotion: "happy" }))).toBe("bright, lively, cheerful");
    expect(characterStyle({ style: "bright, lively" }, cue({ emotion: "angry", delivery: "shout" }))).toBe("bright, lively, angry, intense, shouting loudly");
    expect(characterStyle({ style: "x" }, cue({ emotion: "scared", delivery: "whisper" }))).toBe("x, frightened, shaky, whispering quietly");
  });

  it("adds the inner-monologue phrase for thoughts", () => {
    expect(characterStyle({ style: "x" }, cue({ kind: "thought", emotion: "sad" }))).toBe("x, inner monologue, intimate, sad, subdued");
  });

  it("narration is the narrator style as narration (default: calm, cinematic narration)", () => {
    expect(narrationStyle({ style: "calm, cinematic" }, { delivery: "normal" })).toBe("calm, cinematic narration");
    expect(narrationStyle({ style: "calm, cinematic" }, { delivery: "shout" })).toBe("calm, cinematic narration, shouting loudly");
  });
});

describe("hasSpeakableText", () => {
  it.each([
    ["Hello!", true],
    ["42", true],
    ["Ça va?", true],
    ["こんにちは", true],
    ["...", false],
    ["!?", false],
    ["— ♪ —", false],
    ["", false],
  ])("%j -> %s", (text, expected) => {
    expect(hasSpeakableText(text)).toBe(expected);
  });
});

describe("resolveCueVoice (CONTRACT §3)", () => {
  it("a character's line uses the character's voice snapshot, not the profile table", () => {
    const v = resolveCueVoice(cue({ characterId: hero.id, emotion: "happy" }), [hero], DEFAULT_PROFILES);
    expect(v).toEqual({ voice: "Fenrir", speed: 1.1, pitch: 2, style: "snapshot style, cheerful" });
  });

  it("narration and unknown speakers use the narrator_1 profile from meta.profiles", () => {
    const narrator = DEFAULT_PROFILES.find((p) => p.id === "narrator_1")!;
    const custom = DEFAULT_PROFILES.map((p) => (p.id === "narrator_1" ? { ...p, voice: "Kore", speed: 0.9, pitch: -1 } : p));
    expect(resolveCueVoice(cue({ kind: "narration" }), [hero], DEFAULT_PROFILES)).toEqual({
      voice: narrator.voice,
      speed: narrator.speed,
      pitch: narrator.pitch,
      style: `${narrator.style} narration`,
    });
    // unknown speaker (speech, no characterId) -> narrator, using the profiles the client sent
    expect(resolveCueVoice(cue({ characterId: null }), [hero], custom)).toMatchObject({ voice: "Kore", speed: 0.9, pitch: -1 });
  });

  it("fails loudly on an unknown character, a missing narrator profile, and sfx", () => {
    expect(() => resolveCueVoice(cue({ characterId: "chr_ghost" }), [hero], DEFAULT_PROFILES)).toThrow(/chr_ghost/);
    expect(() => resolveCueVoice(cue({ kind: "narration" }), [], DEFAULT_PROFILES.filter((p) => p.id !== "narrator_1"))).toThrow(/narrator_1/);
    expect(() => resolveCueVoice(cue({ kind: "sfx" }), [], DEFAULT_PROFILES)).toThrow(/sound effect/);
  });
});
