import ffmpegPath from "ffmpeg-static";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TTS_SAMPLE_RATE, encodeMp3, encodedDurationMs, ffmpegArgs, pcmDurationMs, pcmToWav, speedPitchFilter, wavToPcm } from "./audio.js";

/** `seconds` of a 440 Hz sine as 24 kHz mono s16le PCM. */
function sine(seconds: number): Buffer {
  const n = Math.round(seconds * TTS_SAMPLE_RATE);
  const pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / TTS_SAMPLE_RATE)), i * 2);
  return pcm;
}

describe("WAV helpers", () => {
  it("round-trips PCM through a WAV", () => {
    const pcm = sine(0.25);
    const wav = pcmToWav(pcm);
    expect(wav.length).toBe(44 + pcm.length);
    expect(wavToPcm(wav).equals(pcm)).toBe(true);
    expect(pcmDurationMs(pcm)).toBeCloseTo(250, 5);
  });

  it("skips extra chunks before data", () => {
    const pcm = sine(0.1);
    const plain = pcmToWav(pcm);
    const extra = Buffer.concat([Buffer.from("LIST", "ascii"), Buffer.from([4, 0, 0, 0]), Buffer.from("abcd", "ascii")]);
    const wav = Buffer.concat([plain.subarray(0, 36), extra, plain.subarray(36)]);
    expect(wavToPcm(wav).equals(pcm)).toBe(true);
  });

  it("reads a streaming WAV whose data size is 0xFFFFFFFF as data to the end", () => {
    const pcm = sine(0.1);
    const wav = pcmToWav(pcm);
    wav.writeUInt32LE(0xffffffff, 40);
    expect(wavToPcm(wav).equals(pcm)).toBe(true);
  });

  it("fails loudly on a non-WAV, the wrong format, and an empty clip", () => {
    expect(() => wavToPcm(Buffer.from("not a wav file at all, sorry about that, really really"))).toThrow(/not a WAV/);
    const wrongRate = pcmToWav(sine(0.1));
    wrongRate.writeUInt32LE(16000, 24);
    expect(() => wavToPcm(wrongRate)).toThrow(/16000 Hz/);
    expect(() => wavToPcm(pcmToWav(Buffer.alloc(0)))).toThrow(/no audio samples|no data/);
  });
});

describe("speed and pitch filter (CONTRACT §9)", () => {
  it("is asetrate=24000*r, aresample=24000, atempo=speed/r", () => {
    expect(speedPitchFilter(1, 0)).toBe("asetrate=24000.000,aresample=24000,atempo=1.000000");
    const r = 2 ** (3 / 12);
    expect(speedPitchFilter(1.1, 3)).toBe(`asetrate=${(24000 * r).toFixed(3)},aresample=24000,atempo=${(1.1 / r).toFixed(6)}`);
  });

  it("keeps atempo inside 0.5-2.0 at the extremes of the allowed range", () => {
    for (const [speed, pitch] of [[0.8, 6], [1.2, -6], [0.8, -6], [1.2, 6]] as const) {
      const tempo = Number(/atempo=([\d.]+)/.exec(speedPitchFilter(speed, pitch))![1]);
      expect(tempo).toBeGreaterThanOrEqual(0.5);
      expect(tempo).toBeLessThanOrEqual(2);
    }
  });

  it("rejects values outside the contract", () => {
    expect(() => speedPitchFilter(1.3, 0)).toThrow(/speed/);
    expect(() => speedPitchFilter(1, 7)).toThrow(/pitch/);
    expect(() => speedPitchFilter(1, 1.5)).toThrow(/pitch/);
  });

  it("encodes mono 64k MP3 to stdout", () => {
    const args = ffmpegArgs(1, 0);
    expect(args).toContain("libmp3lame");
    expect(args.join(" ")).toContain("-b:a 64k");
    expect(args.join(" ")).toContain("-ac 1");
  });

  it("the encoded length is the speech length divided by the speed", () => {
    expect(encodedDurationMs(sine(1), 1.25)).toBe(800);
    expect(encodedDurationMs(sine(1), 0.8)).toBe(1250);
  });
});

describe("encodeMp3 (real ffmpeg)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "mumu-audio-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  /** Decode an MP3 back to 24 kHz PCM and return its length in ms, as the real duration check. */
  async function decodedMs(mp3: Buffer): Promise<number> {
    const file = path.join(dir, "clip.mp3");
    await writeFile(file, mp3);
    const pcm = execFileSync(ffmpegPath!, ["-hide_banner", "-loglevel", "error", "-i", file, "-f", "s16le", "-ar", "24000", "-ac", "1", "pipe:1"], { maxBuffer: 64 * 1024 * 1024 });
    return pcmDurationMs(pcm);
  }

  it.each([
    [1.0, 0],
    [1.2, 3],
    [0.8, -6],
  ])("speed %s pitch %s produces an MP3 whose real length matches durationMs", async (speed, pitch) => {
    const wav = pcmToWav(sine(1.5));
    const { mp3, durationMs } = await encodeMp3(wav, { speed, pitch });
    expect(mp3.subarray(0, 3).toString("latin1") === "ID3" || (mp3[0] === 0xff && (mp3[1]! & 0xe0) === 0xe0)).toBe(true);
    expect(durationMs).toBe(Math.round(1500 / speed));
    // MP3 adds encoder padding (~50 ms); allow for it.
    expect(Math.abs((await decodedMs(mp3)) - durationMs)).toBeLessThan(120);
    // About 64 kbps.
    expect((mp3.length * 8) / (durationMs / 1000)).toBeGreaterThan(50_000);
    expect((mp3.length * 8) / (durationMs / 1000)).toBeLessThan(80_000);
  });

  it("changing the pitch does not change the length, only the sound", async () => {
    const wav = pcmToWav(sine(1));
    const flat = await encodeMp3(wav, { speed: 1, pitch: 0 });
    const high = await encodeMp3(wav, { speed: 1, pitch: 5 });
    expect(high.durationMs).toBe(flat.durationMs);
    expect(Math.abs((await decodedMs(high.mp3)) - (await decodedMs(flat.mp3)))).toBeLessThan(120);
    expect(high.mp3.equals(flat.mp3)).toBe(false);
  });

  it("fails loudly when given a broken WAV", async () => {
    await expect(encodeMp3(Buffer.from("garbage"), { speed: 1, pitch: 0 })).rejects.toThrow(/not a WAV/);
  });
});
