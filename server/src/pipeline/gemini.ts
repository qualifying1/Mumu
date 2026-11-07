import { FinishReason, GoogleGenAI, type GenerateContentResponse } from "@google/genai";
import { TTS_SAMPLE_RATE, pcmToWav } from "./audio.js";

/** One structured-output vision call: image + prompt in, the model's JSON text out. */
export type VisionGenerate = (args: { model: string; image: Buffer; prompt: string; jsonSchema: unknown }) => Promise<string>;

/** One structured-output text call (the reasoning pass): prompt in, the model's JSON text out. */
export type ReasonGenerate = (args: { model: string; prompt: string; jsonSchema: unknown }) => Promise<string>;

/** Fails loudly on blocked prompts, truncated output and empty text. Never logs the request. */
function textOrThrow(res: GenerateContentResponse): string {
  const blocked = res.promptFeedback?.blockReason;
  if (blocked) throw new Error(`Gemini blocked the prompt (${blocked})`);
  const candidate = res.candidates?.[0];
  const finish = candidate?.finishReason;
  if (finish !== FinishReason.STOP) {
    throw new Error(`Gemini finished with ${finish ?? "no finishReason"}${candidate?.finishMessage ? `: ${candidate.finishMessage}` : ""}`);
  }
  const text = res.text;
  if (!text) throw new Error("Gemini returned no text");
  return text;
}

const jsonConfig = (jsonSchema: unknown) => ({
  responseMimeType: "application/json",
  responseJsonSchema: jsonSchema,
  temperature: 0,
});

/** Real Gemini adapter for the vision stage. */
export function createGeminiVisionGenerate(apiKey: string): VisionGenerate {
  const ai = new GoogleGenAI({ apiKey });
  return async ({ model, image, prompt, jsonSchema }) =>
    textOrThrow(
      await ai.models.generateContent({
        model,
        contents: [
          { role: "user", parts: [{ inlineData: { data: image.toString("base64"), mimeType: "image/jpeg" } }, { text: prompt }] },
        ],
        config: jsonConfig(jsonSchema),
      }),
    );
}

/** Real Gemini adapter for the reasoning stage (text only). */
export function createGeminiReasonGenerate(apiKey: string): ReasonGenerate {
  const ai = new GoogleGenAI({ apiKey });
  return async ({ model, prompt, jsonSchema }) =>
    textOrThrow(
      await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: jsonConfig(jsonSchema),
      }),
    );
}

/**
 * One TTS call: verbatim text + a style direction + a prebuilt voice in, a 24 kHz mono 16-bit WAV
 * out. Speed and pitch are not part of the request (CONTRACT §9).
 */
export type TtsGenerate = (args: { model: string; voice: string; style: string; text: string }) => Promise<Buffer>;

/**
 * Real Gemini TTS adapter. The style travels in `speechMetadata.style` so the model does not read
 * it aloud; the text stays verbatim. The reply is either a complete WAV (`audio/wav`, the unary
 * default of the 3.8 models) or raw 16-bit PCM (`audio/l16;rate=24000`); both come out as WAV.
 */
export function createGeminiTtsGenerate(apiKey: string): TtsGenerate {
  // @google/genai 3.x defaults to API v1, which rejects speechConfig and speechMetadata; TTS needs v1beta.
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1beta" } });
  return async ({ model, voice, style, text }) => {
    const res = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text, ...(style ? { speechMetadata: { style } } : {}) }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    });
    const blocked = res.promptFeedback?.blockReason;
    if (blocked) throw new Error(`Gemini blocked the TTS prompt (${blocked})`);
    const candidate = res.candidates?.[0];
    const inline = candidate?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!inline?.data) throw new Error(`Gemini TTS returned no audio (finishReason ${candidate?.finishReason ?? "none"})`);
    const bytes = Buffer.from(inline.data, "base64");
    const mime = (inline.mimeType ?? "").toLowerCase();
    if (mime.includes("wav") || mime.includes("wave")) return bytes;
    if (mime.includes("l16") || mime.includes("pcm")) {
      const rate = /rate=(\d+)/.exec(mime)?.[1];
      if (rate !== undefined && Number(rate) !== TTS_SAMPLE_RATE) throw new Error(`Gemini TTS returned PCM at ${rate} Hz; expected ${TTS_SAMPLE_RATE}`);
      return pcmToWav(bytes);
    }
    throw new Error(`Gemini TTS returned an unexpected audio type "${inline.mimeType ?? "(none)"}"`);
  };
}
