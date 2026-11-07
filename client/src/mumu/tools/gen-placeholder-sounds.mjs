// Generates PLACEHOLDER Mumu sounds (synthesised beeps, mono MP3) into client/public/audio/mumu/.
// Run from the repo root:  node client/src/mumu/tools/gen-placeholder-sounds.mjs
// Real files (Pixabay "cat meow" / "cat purr", docs/ASSETS.md §4) replace them under the same names.
// Uses ffmpeg-static, which is already a dependency of the server.
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ffmpeg = require("ffmpeg-static");
if (typeof ffmpeg !== "string") throw new Error("ffmpeg-static did not resolve to a binary path (run npm install)");

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "..", "..", "public", "audio", "mumu");
mkdirSync(outDir, { recursive: true });

// name -> lavfi source + filters. Purr is a 2.5 s low tremolo loop; the rest are short chirps.
const sounds = {
  meow1: "sine=frequency=620:duration=0.5,tremolo=f=9:d=0.5,afade=t=out:st=0.3:d=0.2",
  meow2: "sine=frequency=520:duration=0.6,tremolo=f=7:d=0.6,afade=t=out:st=0.4:d=0.2",
  meow3: "sine=frequency=720:duration=0.4,tremolo=f=11:d=0.4,afade=t=out:st=0.25:d=0.15",
  mrrp: "sine=frequency=840:duration=0.22,tremolo=f=18:d=0.7,afade=t=out:st=0.12:d=0.1",
  purr: "sine=frequency=95:duration=2.5,tremolo=f=24:d=0.9",
};

for (const [name, graph] of Object.entries(sounds)) {
  const file = join(outDir, `${name}.mp3`);
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", graph, "-ac", "1", "-b:a", "64k", file]);
  console.log(`${name}.mp3  ${statSync(file).size} bytes`);
}
