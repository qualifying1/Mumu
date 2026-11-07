// Generates PLACEHOLDER Mumu strips (numbered, coloured frames) into client/public/mumu/.
// Run from the repo root:  node client/src/mumu/tools/gen-placeholders.mjs
// Real art replaces the PNGs with the same file names; update frame counts in ../sprites.ts.
// The frame counts below are read from sprites.ts so there is one source of truth.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "..", "..", "public", "mumu");

// ---- read the manifest (a TS file, so parse the literal rather than import it) ----
const manifestSrc = readFileSync(join(here, "..", "sprites.ts"), "utf8");
const frameSize = Number(/FRAME_SIZE\s*=\s*(\d+)/.exec(manifestSrc)?.[1]);
if (!Number.isInteger(frameSize)) throw new Error("FRAME_SIZE not found in sprites.ts");
const anims = {};
for (const m of manifestSrc.matchAll(/^\s{2}(\w+):\s*\{\s*frames:\s*(\d+)/gm)) anims[m[1]] = Number(m[2]);
if (Object.keys(anims).length === 0) throw new Error("no animations found in sprites.ts");

// ---- tiny PNG encoder (RGBA, 8-bit, no filter) ----
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- 3x5 digit font ----
const DIGITS = {
  0: ["111", "101", "101", "101", "111"],
  1: ["010", "110", "010", "010", "111"],
  2: ["111", "001", "111", "100", "111"],
  3: ["111", "001", "111", "001", "111"],
  4: ["101", "101", "111", "001", "001"],
  5: ["111", "100", "111", "001", "111"],
  6: ["111", "100", "111", "101", "111"],
  7: ["111", "001", "001", "001", "001"],
  8: ["111", "101", "111", "101", "111"],
  9: ["111", "101", "111", "001", "111"],
};

// One hue per animation so a wrong strip is obvious at a glance. [fill, outline]
const COLORS = {
  walk: [[240, 140, 40], [90, 40, 10]],
  sit: [[245, 170, 80], [90, 40, 10]],
  tailwag: [[250, 200, 90], [90, 40, 10]],
  loaf: [[220, 120, 60], [80, 30, 10]],
  yarn: [[230, 90, 110], [90, 20, 40]],
  climb: [[110, 180, 90], [30, 70, 30]],
  hang: [[90, 170, 200], [20, 60, 90]],
  held: [[170, 130, 220], [60, 40, 100]],
  meow: [[240, 220, 90], [100, 80, 10]],
};
const FALLBACK = [[200, 200, 200], [40, 40, 40]];

function drawFrame(buf, stripWidth, frameIndex, name) {
  const [fill, line] = COLORS[name] ?? FALLBACK;
  const x0 = frameIndex * frameSize;
  const put = (x, y, [r, g, b]) => {
    const i = (y * stripWidth + x0 + x) * 4;
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = 255;
  };
  // Body: a box with 1px margin on the sides and sitting on the bottom row (the feet baseline).
  // The bottom edge is the same row in every animation, so switching animations doesn't jump.
  const top = 6;
  const bottom = frameSize - 1;
  for (let y = top; y <= bottom; y++) {
    for (let x = 1; x < frameSize - 1; x++) {
      const edge = y === top || y === bottom || x === 1 || x === frameSize - 2;
      put(x, y, edge ? line : fill);
    }
  }
  // Ears so it reads as a cat, and a nose on the right so facing is visible.
  for (const ex of [4, frameSize - 7]) for (let y = 3; y < top; y++) for (let x = ex; x < ex + 3; x++) put(x, y, line);
  for (let y = 12; y < 15; y++) for (let x = frameSize - 5; x < frameSize - 2; x++) put(x, y, [255, 255, 255]);
  // Frame number (1-based), 3x scale, centred in the box.
  const label = String(frameIndex + 1);
  const scale = 3;
  const w = label.length * 4 * scale - scale;
  const sx = Math.floor((frameSize - w) / 2);
  const sy = 14;
  for (let d = 0; d < label.length; d++) {
    DIGITS[label[d]].forEach((row, ry) => {
      [...row].forEach((bit, rx) => {
        if (bit !== "1") return;
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) put(sx + d * 4 * scale + rx * scale + dx, sy + ry * scale + dy, [20, 20, 20]);
      });
    });
  }
}

mkdirSync(outDir, { recursive: true });
for (const [name, frames] of Object.entries(anims)) {
  const width = frames * frameSize;
  const rgba = Buffer.alloc(width * frameSize * 4); // transparent
  for (let f = 0; f < frames; f++) drawFrame(rgba, width, f, name);
  const file = join(outDir, `${name}.png`);
  writeFileSync(file, encodePng(width, frameSize, rgba));
  console.log(`${name}.png  ${frames} frames  ${width}x${frameSize}`);
}
