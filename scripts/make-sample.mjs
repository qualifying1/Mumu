// Builds fixtures/sample.json: a hand-written ChapterPackage for ch1 pages 0–2 with sine-beep MP3s.
// Run: npm run sample. Needs no API key; uses ffmpeg-static only.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

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

const newCharacters = [
  {
    id: "chr_hero",
    seriesId: SERIES,
    name: "Hero",
    description: "Young man with spiky black hair and a torn red scarf",
    voiceSlot: "male_young",
    profileId: "male_young_1",
    firstSeenChapterId: CHAPTER,
  },
  {
    id: "chr_mentor",
    seriesId: SERIES,
    name: "Mentor",
    description: "Elderly man with a white beard and a wooden staff",
    voiceSlot: "male_elder",
    profileId: "male_elder_1",
    firstSeenChapterId: CHAPTER,
  },
];

// Cue → [freq Hz, duration ms] for its beep (null = no audio). Boxes are page fractions.
const cueSpecs = [
  { id: "cue_1", kind: "narration", pageIndex: 0, box: [0.1, 0.08, 0.9, 0.16], text: "The mountain village slept under a pale moon.", characterId: null, emotion: "neutral", delivery: "normal", beep: [440, 700] },
  { id: "cue_2", kind: "speech", pageIndex: 0, box: [0.15, 0.4, 0.7, 0.48], text: "Master, something is coming.", characterId: "chr_hero", emotion: "scared", delivery: "whisper", beep: [523, 600] },
  { id: "cue_3", kind: "speech", pageIndex: 0, box: [0.3, 0.7, 0.85, 0.78], text: "Steady. Do not draw your sword yet.", characterId: "chr_mentor", emotion: "determined", delivery: "normal", beep: [330, 650] },
  { id: "cue_4", kind: "sfx", pageIndex: 1, box: [0.2, 0.2, 0.6, 0.3], text: "BOOM!", characterId: null, emotion: "neutral", delivery: "shout", sfxTag: "explosion", beep: null },
  { id: "cue_5", kind: "speech", pageIndex: 1, box: [0.1, 0.55, 0.65, 0.63], text: "Get down!", characterId: "chr_hero", emotion: "angry", delivery: "shout", beep: [587, 500] },
  { id: "cue_6", kind: "thought", pageIndex: 2, box: [0.2, 0.35, 0.8, 0.43], text: "I won't let them take this place.", characterId: "chr_hero", emotion: "determined", delivery: "normal", beep: [494, 700] },
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
    { id: "reg_1", start: { pageIndex: 0, y: 0.05 }, end: { pageIndex: 1, y: 0.15 }, mood: "tense", intensity: 2 },
    { id: "reg_2", start: { pageIndex: 1, y: 0.15 }, end: { pageIndex: 2, y: 0.5 }, mood: "battle", intensity: 3 },
  ],
  recap: {
    text: "Mumu remembers: a quiet village, a nervous hero, and a mentor who sensed trouble before anyone else.",
    audioId: "aud_recap",
  },
  audio,
};

const out = resolve(root, "fixtures", "sample.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`wrote ${out}: ${cues.length} cues, ${pkg.regions.length} regions, ${audio.length} audio clips`);
