import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";

/** Gemini TTS output: 24 kHz, mono, 16-bit signed little-endian PCM (CONTRACT §9). */
export const TTS_SAMPLE_RATE = 24000;
const BYTES_PER_SAMPLE = 2;
const WAV_HEADER_BYTES = 44;
/** Output bitrate: mono MP3 about 64 kbps (CONTRACT §5). */
const MP3_BITRATE = "64k";

/** Wrap raw PCM in a canonical 44-byte WAV header (PCM, mono, 16-bit, 24 kHz). This is what the TTS cache stores. */
export function pcmToWav(pcm: Uint8Array): Buffer {
  const header = Buffer.alloc(WAV_HEADER_BYTES);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(TTS_SAMPLE_RATE, 24);
  header.writeUInt32LE(TTS_SAMPLE_RATE * BYTES_PER_SAMPLE, 28); // byte rate
  header.writeUInt16LE(BYTES_PER_SAMPLE, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * Validate a WAV and return its PCM. Walks the chunks (a header may carry extras) and insists on
 * mono 16-bit PCM at 24 kHz; anything else would be encoded at the wrong pitch, so it fails loudly.
 */
export function wavToPcm(wav: Uint8Array): Buffer {
  const buf = Buffer.from(wav.buffer, wav.byteOffset, wav.byteLength);
  if (buf.length < WAV_HEADER_BYTES || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("audio is not a WAV file");
  }
  let fmtOk = false;
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      const format = buf.readUInt16LE(body);
      const channels = buf.readUInt16LE(body + 2);
      const rate = buf.readUInt32LE(body + 4);
      const bits = buf.readUInt16LE(body + 14);
      if (format !== 1 || channels !== 1 || rate !== TTS_SAMPLE_RATE || bits !== 16) {
        throw new Error(`WAV is format ${format}, ${channels} ch, ${rate} Hz, ${bits}-bit; expected PCM mono 24000 Hz 16-bit`);
      }
      fmtOk = true;
    } else if (id === "data") {
      if (!fmtOk) throw new Error("WAV has a data chunk before its fmt chunk");
      // Streaming encoders may leave the size as 0 or 0xFFFFFFFF: then the data runs to the end of the file.
      const end = size === 0 || size === 0xffffffff || body + size > buf.length ? buf.length : body + size;
      const pcm = buf.subarray(body, end - ((end - body) % BYTES_PER_SAMPLE));
      if (pcm.length === 0) throw new Error("WAV has no audio samples");
      return pcm;
    }
    offset = body + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}

/** Length of the speech before the speed change, in ms. */
export function pcmDurationMs(pcm: Uint8Array): number {
  return (pcm.length / BYTES_PER_SAMPLE / TTS_SAMPLE_RATE) * 1000;
}

/**
 * CONTRACT §9: with r = 2^(pitch/12), `asetrate=24000*r, aresample=24000, atempo=speed/r`.
 * asetrate shifts pitch and speed by r, atempo undoes that and applies the speed, so the clip
 * ends up pitch-shifted by `pitch` semitones and `speed` times faster.
 */
export function speedPitchFilter(speed: number, pitch: number): string {
  if (!(speed >= 0.8 && speed <= 1.2)) throw new Error(`speed ${speed} is outside 0.8-1.2`);
  if (!Number.isInteger(pitch) || pitch < -6 || pitch > 6) throw new Error(`pitch ${pitch} is not an integer in -6..6`);
  const r = 2 ** (pitch / 12);
  const tempo = speed / r;
  return `asetrate=${(TTS_SAMPLE_RATE * r).toFixed(3)},aresample=${TTS_SAMPLE_RATE},atempo=${tempo.toFixed(6)}`;
}

export function ffmpegArgs(speed: number, pitch: number): string[] {
  return [
    "-hide_banner",
    "-loglevel", "error",
    "-f", "s16le", "-ar", String(TTS_SAMPLE_RATE), "-ac", "1", "-i", "pipe:0",
    "-af", speedPitchFilter(speed, pitch),
    "-c:a", "libmp3lame", "-b:a", MP3_BITRATE, "-ac", "1",
    "-f", "mp3", "pipe:1",
  ];
}

/** Playing time of the encoded clip: the speech length divided by the speed (the pitch trick cancels out). */
export function encodedDurationMs(pcm: Uint8Array, speed: number): number {
  return Math.max(1, Math.round(pcmDurationMs(pcm) / speed));
}

export interface EncodedClip {
  mp3: Buffer;
  durationMs: number;
}

/** Cached WAV -> mono MP3 with the voice's speed and pitch. Never calls the TTS model. */
export async function encodeMp3(wav: Uint8Array, opts: { speed: number; pitch: number }): Promise<EncodedClip> {
  if (!ffmpegPath) throw new Error("ffmpeg-static has no binary for this platform");
  const pcm = wavToPcm(wav);
  const args = ffmpegArgs(opts.speed, opts.pitch);

  const mp3 = await new Promise<Buffer>((resolve, reject) => {
    const child = spawn(ffmpegPath!, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => out.push(c));
    child.stderr.on("data", (c: Buffer) => err.push(c));
    child.on("error", reject);
    // ffmpeg may exit before reading all input when it fails; its exit code and stderr then explain why.
    child.stdin.on("error", (e: NodeJS.ErrnoException) => {
      if (e.code !== "EPIPE") reject(e);
    });
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`ffmpeg exited with ${code}: ${Buffer.concat(err).toString("utf8").trim().slice(0, 500)}`));
    });
    child.stdin.end(pcm);
  });
  if (mp3.length === 0) throw new Error("ffmpeg produced no audio");
  return { mp3, durationMs: encodedDurationMs(pcm, opts.speed) };
}
