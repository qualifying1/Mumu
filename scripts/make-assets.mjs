// Generates the synthesized demo assets (no third-party files): SFX, music for the moods that have no
// licensed track, the zzz/note emotes and the PWA icons. Re-run with: node scripts/make-assets.mjs
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const pub = path.join(root, "client", "public");
const SR = 32000;

// ---------- helpers ----------
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const buf = (sec) => new Float32Array(Math.round(sec * SR));
const lerp = (a, b, t) => a + (b - a) * t;
const env = (i, n, attack, decay) => Math.min(1, i / SR / attack) * Math.exp((-decay * i) / n);
function lowpass(x, fc) {
  const a = 1 - Math.exp((-2 * Math.PI * fc) / SR);
  let y = 0;
  return x.map((v) => (y += a * (v - y)));
}
function bandpass(x, f0, q = 2) {
  const w = (2 * Math.PI * f0) / SR;
  const alpha = Math.sin(w) / (2 * q);
  const cw = Math.cos(w);
  const b0 = alpha, b2 = -alpha, a0 = 1 + alpha, a1 = -2 * cw, a2 = 1 - alpha;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return x.map((v) => {
    const y = (b0 * v + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = v; y2 = y1; y1 = y;
    return y;
  });
}
const noise = (sec) => buf(sec).map(() => rnd());
const click = (sec, ms) => noise(sec).map((v, i) => v * Math.exp(-i / (SR * ms)));
function mix(out, src, at = 0, gain = 1) {
  const o = Math.round(at * SR);
  for (let i = 0; i < src.length && o + i < out.length; i++) out[o + i] += src[i] * gain;
}
function tone(sec, f, { attack = 0.005, decay = 4, harm = [1], sweep = null, vib = 0 } = {}) {
  const x = buf(sec);
  let phase = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / x.length;
    const freq = (sweep ? lerp(sweep[0], sweep[1], t) : f) * (1 + vib * Math.sin((2 * Math.PI * 5.5 * i) / SR));
    phase += (2 * Math.PI * freq) / SR;
    let v = 0;
    harm.forEach((h, k) => (v += h * Math.sin(phase * (k + 1))));
    x[i] = v * env(i, x.length, attack, decay);
  }
  return x;
}
function normalize(x, peak = 0.8) {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  return m === 0 ? x : x.map((v) => (v / m) * peak);
}
function fadeEdges(x, ms = 25) {
  const n = Math.round((ms / 1000) * SR);
  for (let i = 0; i < n && i < x.length; i++) {
    x[i] *= i / n;
    x[x.length - 1 - i] *= i / n;
  }
  return x;
}
function encode(x, file, kbps = 64) {
  const pcm = Buffer.alloc(x.length * 2);
  x.forEach((v, i) => pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), i * 2));
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ["-y", "-loglevel", "error", "-f", "s16le", "-ar", String(SR), "-ac", "1", "-i", "-", "-b:a", `${kbps}k`, file]);
    p.on("error", reject);
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg exited ${c} for ${file}`))));
    p.stdin.end(pcm);
  });
}
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

// ---------- SFX (tags from shared/src/enums.ts) ----------
const sfx = {
  punch() {
    const o = buf(0.35);
    mix(o, tone(0.3, 0, { sweep: [170, 45], decay: 7, harm: [1, 0.3] }), 0, 1);
    mix(o, lowpass(click(0.1, 0.02), 2500), 0, 0.9);
    return o;
  },
  sword_clash() {
    const o = buf(0.9);
    [2100, 3150, 4730, 5900, 7300].forEach((f, i) => mix(o, tone(0.9, f, { decay: 5 + i }), 0, 0.35));
    mix(o, click(0.06, 0.01), 0, 0.8);
    return o;
  },
  explosion() {
    const o = buf(1.6);
    mix(o, lowpass(noise(1.6), 900).map((v, i, a) => v * Math.exp((-3 * i) / a.length)), 0, 1);
    mix(o, tone(1.4, 0, { sweep: [90, 30], decay: 3 }), 0, 1);
    return o;
  },
  whoosh() {
    const n = noise(0.8);
    const o = buf(0.7);
    const chunk = 1024;
    for (let s = 0; s < o.length; s += chunk) {
      const t = s / o.length;
      const part = bandpass(n.slice(s, s + chunk), lerp(400, 3200, t), 1.2);
      for (let i = 0; i < chunk && s + i < o.length; i++) o[s + i] = part[i] * Math.sin(Math.PI * t) ** 2;
    }
    return o;
  },
  footsteps() {
    const o = buf(1.4);
    for (let k = 0; k < 4; k++) {
      mix(o, lowpass(click(0.12, 0.03), 700), k * 0.33, 1.2);
      mix(o, tone(0.1, 0, { sweep: [120, 70], decay: 8 }), k * 0.33, 0.5);
    }
    return o;
  },
  door() {
    const o = buf(0.9);
    mix(o, tone(0.25, 0, { sweep: [140, 70], decay: 8, harm: [1, 0.5] }), 0, 1);
    mix(o, lowpass(click(0.1, 0.02), 1500), 0, 0.7);
    mix(o, tone(0.25, 0, { sweep: [130, 65], decay: 8, harm: [1, 0.5] }), 0.35, 0.8);
    return o;
  },
  heartbeat() {
    const o = buf(2.0);
    for (let k = 0; k < 2; k++) {
      mix(o, tone(0.22, 62, { decay: 9, attack: 0.01 }), k * 0.9, 1);
      mix(o, tone(0.2, 55, { decay: 9, attack: 0.01 }), k * 0.9 + 0.22, 0.75);
    }
    return o;
  },
  gasp() {
    const o = bandpass(noise(0.5), 1800, 0.8);
    return o.map((v, i) => v * Math.sin((Math.PI * i) / o.length) ** 1.5);
  },
  crowd() {
    const o = buf(2.0);
    for (let k = 0; k < 8; k++) {
      const voice = bandpass(noise(2.0), 300 + k * 140, 3);
      const rate = 2 + k * 0.6;
      voice.forEach((v, i) => (o[i] += v * (0.5 + 0.5 * Math.sin((2 * Math.PI * rate * i) / SR + k))));
    }
    return o.map((v, i) => v * Math.sin((Math.PI * i) / o.length) ** 0.5);
  },
  magic() {
    const o = buf(1.2);
    [76, 79, 83, 88, 91, 95].forEach((m, k) => mix(o, tone(0.7, hz(m), { decay: 5, harm: [1, 0.25], vib: 0.01 }), k * 0.09, 0.5));
    return o;
  },
};

// ---------- music (bar-aligned loops) ----------
function track(bpm, bars, beatsPerBar, voices) {
  const beat = 60 / bpm;
  const o = buf(bars * beatsPerBar * beat);
  for (const v of voices) v(o, beat);
  return fadeEdges(normalize(o, 0.55), 40);
}
/** Repeat a 4-chord progression `times` times. */
const prog = (chords, times) => Array.from({ length: times }, () => chords).flat();
const pad = (chords, beatsPerChord, gain) => (o, beat) =>
  chords.forEach((ch, ci) => {
    const len = beatsPerChord * beat;
    ch.forEach((m) => [-0.07, 0.07].forEach((det) => mix(o, tone(len, hz(m) * 2 ** (det / 12), { attack: 0.6, decay: 0.8, harm: [1, 0.2] }), ci * len, gain / ch.length)));
  });
const arp = (chords, beatsPerChord, perBeat, octave, gain, decay, harm) => (o, beat) =>
  chords.forEach((ch, ci) => {
    const steps = beatsPerChord * perBeat;
    for (let s = 0; s < steps; s++) mix(o, tone(beat * 1.2, hz(ch[s % ch.length] + octave), { decay, harm }), ci * beatsPerChord * beat + (s * beat) / perBeat, gain);
  });
const bass = (roots, beatsPerChord, pattern, gain) => (o, beat) =>
  roots.forEach((r, ci) => pattern.forEach(([at, len]) => mix(o, tone(len * beat, hz(r - 12), { decay: 3, harm: [1, 0.4] }), (ci * beatsPerChord + at) * beat, gain)));

const music = {
  // 16 chords x 4 beats at 60 bpm = 64 s
  calm: () => {
    const c = prog([[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], 4);
    return track(60, 16, 4, [pad(c, 4, 0.5), arp(c.map((x) => [...x, x[0] + 12]), 4, 1, 0, 0.25, 2.5, [1, 0.15])]);
  },
  // 16 chords x 3 beats at 72 bpm = 40 s
  romance: () => {
    const c = prog([[53, 57, 60], [55, 59, 62], [52, 55, 59], [57, 60, 64]], 4);
    return track(72, 16, 3, [pad(c, 3, 0.45), arp(c.map((x) => [...x, x[0] + 12]), 3, 2, 12, 0.22, 3.5, [1, 0.2, 0.1]), bass(c.map((x) => x[0]), 3, [[0, 2.5]], 0.5)]);
  },
  // 16 chords x 4 beats at 64 bpm = 60 s
  mystery: () => {
    const c = prog([[57, 60, 63], [57, 60, 63], [56, 59, 62], [57, 60, 63]], 4);
    const pings = (o, beat) => [0, 10, 18, 28, 36, 46, 54, 60].forEach((b, k) => mix(o, tone(beat * 3, hz([81, 84, 79, 87, 81, 76, 84, 82][k]), { decay: 2.2, harm: [1, 0.5, 0.2], vib: 0.003 }), b * beat, 0.3));
    return track(64, 16, 4, [pad(c, 4, 0.5), pings, bass(c.map((x) => x[0] - 12), 4, [[0, 3.5]], 0.45)]);
  },
  // 16 bars x 4 beats at 124 bpm = ~31 s
  comedic: () => {
    const roots = prog([48, 48, 53, 55], 4);
    const melody = [72, 76, 79, 76, 72, 76, 79, 84, 72, 77, 81, 77, 74, 79, 83, 79];
    const tune = (o, beat) => {
      for (let b = 0; b < 16 * 4; b += 2) mix(o, tone(beat * 0.6, hz(melody[(b / 2) % melody.length]), { decay: 9, harm: [1, 0.5, 0.25] }), b * beat, 0.35);
    };
    return track(124, 16, 4, [bass(roots, 4, [[0, 0.5], [1, 0.5], [2, 0.5], [3, 0.5]], 0.6), tune]);
  },
};

// ---------- emotes (16x16; outline and fill in the same family as heart.png) ----------
const OUT = [120, 20, 40, 255];
function emote(rows, fill) {
  const px = Buffer.alloc(16 * 16 * 4);
  const paint = (x, y, c) => c.forEach((v, k) => (px[(y * 16 + x) * 4 + k] = v));
  const set = new Set();
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch === "#" && set.add(`${x},${y}`)));
  for (const key of set) {
    const [x, y] = key.split(",").map(Number);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < 16 && ny < 16 && !set.has(`${nx},${ny}`)) paint(nx, ny, OUT);
    }
  }
  for (const key of set) {
    const [x, y] = key.split(",").map(Number);
    paint(x, y, fill);
  }
  return sharp(px, { raw: { width: 16, height: 16, channels: 4 } }).png();
}
const zzz = [
  "................", "....#####.......", "......##........", ".....##.........", "....#####..####.",
  "............##..", "...........##...", "..........####..", "................", "................",
  "................", "................", "................", "................", "................", "................",
];
const note = [
  "................", ".......#####....", ".......#####....", ".......##..##...", ".......##..##...",
  ".......##.......", ".......##.......", ".......##.......", ".......##.......", "....####........",
  "...#####........", "...####.........", "................", "................", "................", "................",
];

// ---------- icons ----------
async function icons() {
  const dir = path.join(pub, "icons");
  await mkdir(dir, { recursive: true });
  const face = await sharp(path.join(pub, "mumu", "sit.png")).extract({ left: 0, top: 0, width: 32, height: 32 }).png().toBuffer();
  const bg = { r: 26, g: 28, b: 44, alpha: 1 };
  const make = async (size, scale, file) => {
    const cat = await sharp(face).resize(32 * scale, 32 * scale, { kernel: "nearest" }).png().toBuffer();
    await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
      .composite([{ input: cat, gravity: "centre" }])
      .png()
      .toFile(path.join(dir, file));
  };
  await make(192, 5, "icon-192.png");
  await make(512, 13, "icon-512.png");
  await make(512, 10, "icon-maskable-512.png"); // cat well inside the 80% safe zone
  await make(180, 5, "apple-touch-icon.png");
}

// ---------- run ----------
await mkdir(path.join(pub, "audio", "sfx"), { recursive: true });
for (const [tag, make] of Object.entries(sfx)) {
  await encode(fadeEdges(normalize(make(), 0.8), 8), path.join(pub, "audio", "sfx", `${tag}.mp3`));
  console.log(`sfx/${tag}.mp3`);
}
for (const [mood, make] of Object.entries(music)) {
  const dir = path.join(pub, "audio", "music", mood);
  await mkdir(dir, { recursive: true });
  await encode(make(), path.join(dir, "1.mp3"), 96);
  console.log(`music/${mood}/1.mp3`);
}
await emote(zzz, [200, 230, 255, 255]).toFile(path.join(pub, "mumu", "emotes", "zzz.png"));
await emote(note, [255, 235, 200, 255]).toFile(path.join(pub, "mumu", "emotes", "note.png"));
await icons();
console.log("emotes + icons done");
