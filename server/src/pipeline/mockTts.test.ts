import { describe, expect, it } from "vitest";
import { pcmDurationMs, wavToPcm } from "./audio.js";
import { createMockTtsGenerate, mockDurationMs, voiceFrequency } from "./mockTts.js";

describe("mock TTS", () => {
  it("returns a valid 24 kHz mono WAV whose length follows the text", async () => {
    const gen = createMockTtsGenerate();
    const short = await gen({ model: "m", voice: "Kore", style: "", text: "Hi" });
    const long = await gen({ model: "m", voice: "Kore", style: "", text: "A much longer line of dialogue." });
    expect(pcmDurationMs(wavToPcm(short))).toBeCloseTo(mockDurationMs("Hi"), -1);
    expect(pcmDurationMs(wavToPcm(long))).toBeGreaterThan(pcmDurationMs(wavToPcm(short)));
  });
  it("gives different voices different pitches", () => {
    expect(voiceFrequency("Kore")).not.toBe(voiceFrequency("Charon"));
    expect(voiceFrequency("Kore")).toBe(voiceFrequency("Kore"));
  });
  it("is not silent", async () => {
    const pcm = wavToPcm(await createMockTtsGenerate()({ model: "m", voice: "Orus", style: "", text: "Hello" }));
    let peak = 0;
    for (let i = 0; i + 1 < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
    expect(peak).toBeGreaterThan(1000);
  });
});
