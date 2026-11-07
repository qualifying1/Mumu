// Builds fixtures/sample.json: a hand-written ChapterPackage for ch1 pages 0–2 (Pepper&Carrot ep31, files 001–003) with sine-beep MP3s.
// Run: npm run sample (via tsx, so it can import @mumu/shared). Needs no API key; uses ffmpeg-static only.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { DEFAULT_PROFILES, snapshotVoice } from "@mumu/shared";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!ffmpegPath) throw new Error("ffmpeg-static has no binary for this platform");

/** Mono ~64 kbps MP3 sine beep, returned as { dataBase64, durationMs }. */
function beep(freqHz, durationMs) {
  const args = [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", `sine=frequency=${freqHz}:duration=${durationMs / 1000}`,
    "-ac", "1", "-b:a", "64k", "-f", "mp3", "pipe:1",
  ];
  const r = spawnSync(ffmpegPath, args, { maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout?.length) {
    throw new Error(`ffmpeg failed (status ${r.status}): ${r.stderr?.toString() ?? "no stderr"}`);
  }
  return { dataBase64: r.stdout.toString("base64"), durationMs };
}

const SERIES = "series_sample";
const CHAPTER = "chapter_sample_1";

// A character's voice is a snapshot of its profile (CONTRACT §3), taken the same way casting does.
const voiceOf = (profileId) => {
  const profile = DEFAULT_PROFILES.find((p) => p.id === profileId);
  if (!profile) throw new Error(`unknown profile ${profileId}`);
  return snapshotVoice(profile);
};

const newCharacters = [
  {
    id: "chr_pepper",
    seriesId: SERIES,
    name: "Pepper",
    description: "Young witch with a huge floppy witch hat, red vest and plaid cuffs",
    voiceSlot: "female_young",
    profileId: "female_young_1",
    voice: voiceOf("female_young_1"),
    firstSeenChapterId: CHAPTER,
  },
  {
    id: "chr_carrot",
    seriesId: SERIES,
    name: "Carrot",
    description: "Small orange tabby cat who rides on Pepper's shoulder",
    voiceSlot: "male_young",
    profileId: "male_young_1",
    voice: voiceOf("male_young_1"),
    firstSeenChapterId: CHAPTER,
  },
  {
    id: "chr_rival",
    seriesId: SERIES,
    name: "Rival Witch",
    description: "Stern, scowling duelist in a dark pointed hat with a belt buckle",
    voiceSlot: "male_deep",
    profileId: "male_deep_1",
    voice: voiceOf("male_deep_1"),
    firstSeenChapterId: CHAPTER,
  },
];

// Pepper&Carrot ep31 (CC BY 4.0, David Revoy; see CREDITS.md): fixtures/ch1/001–003 = pageIndex 0–2.
// Boxes are page fractions (bubble pixel coords / 1200 x 1660), hand-measured on the real pages.
// Cue → [freq Hz, duration ms] for its beep (null = no audio).
const cueSpecs = [
  { id: "cue_1", kind: "narration", pageIndex: 0, box: [0.029, 0.018, 0.253, 0.059], text: "Tenebrume, sacred hill of Chaosah.", characterId: null, emotion: "neutral", delivery: "normal", beep: [440, 900] },
  { id: "cue_2", kind: "speech", pageIndex: 0, box: [0.465, 0.729, 0.64, 0.771], text: "Take that!", characterId: "chr_pepper", emotion: "angry", delivery: "shout", beep: [523, 600] },
  { id: "cue_3", kind: "speech", pageIndex: 0, box: [0.704, 0.744, 0.821, 0.768], text: "Amateur!", characterId: "chr_carrot", emotion: "smug", delivery: "normal", beep: [659, 600] },
  { id: "cue_4", kind: "sfx", pageIndex: 0, box: [0.767, 0.777, 0.883, 0.928], text: "SLAM!", characterId: null, emotion: "neutral", delivery: "shout", sfxTag: "magic", beep: null },
  { id: "cue_5", kind: "speech", pageIndex: 1, box: [0.754, 0.425, 0.95, 0.473], text: "Gravitationas shieldus!", characterId: "chr_pepper", emotion: "determined", delivery: "shout", beep: [587, 800] },
  { id: "cue_6", kind: "speech", pageIndex: 2, box: [0.821, 0.054, 0.933, 0.127], text: "Carrot! Plan 7-B!", characterId: "chr_pepper", emotion: "determined", delivery: "shout", beep: [494, 800] },
  { id: "cue_7", kind: "speech", pageIndex: 2, box: [0.23, 0.448, 0.348, 0.484], text: "Argh!!", characterId: "chr_rival", emotion: "angry", delivery: "shout", beep: [262, 500] },
];

const audio = [];
const cues = cueSpecs.map((spec, i) => {
  let audioId = null;
  if (spec.beep) {
    audioId = `aud_${spec.id}`;
    audio.push({ id: audioId, mime: "audio/mpeg", ...beep(...spec.beep) });
  }
  const [x0, y0, x1, y1] = spec.box;
  return {
    id: spec.id,
    order: i + 1,
    kind: spec.kind,
    pageIndex: spec.pageIndex,
    box: { x0, y0, x1, y1 },
    text: spec.text,
    characterId: spec.characterId,
    emotion: spec.emotion,
    delivery: spec.delivery,
    audioId,
    sfxTag: spec.kind === "sfx" ? spec.sfxTag : null,
  };
});

const recapClip = beep(392, 900);
audio.push({ id: "aud_recap", mime: "audio/mpeg", ...recapClip });

const pkg = {
  contractVersion: 1,
  seriesId: SERIES,
  chapterId: CHAPTER,
  models: { vision: "hand-written", reasoning: "hand-written", tts: "ffmpeg-sine" },
  newCharacters,
  cues,
  regions: [
    // Establishing moonlit chase, then the duel starts at the three-panel row on page 0.
    { id: "reg_1", start: { pageIndex: 0, y: 0 }, end: { pageIndex: 0, y: 0.42 }, mood: "tense", intensity: 2 },
    { id: "reg_2", start: { pageIndex: 0, y: 0.42 }, end: { pageIndex: 2, y: 0.7 }, mood: "battle", intensity: 3 },
  ],
  recap: {
    text: "Mumu remembers: Pepper and Carrot are dueling a furious rival witch above the moonlit hill of Tenebrume. Pepper survived a blast with a shield spell, and Carrot has just started Plan 7-B.",
    audioId: "aud_recap",
  },
  audio,
};

const out = resolve(root, "fixtures", "sample.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`wrote ${out}: ${cues.length} cues, ${pkg.regions.length} regions, ${audio.length} audio clips`);
