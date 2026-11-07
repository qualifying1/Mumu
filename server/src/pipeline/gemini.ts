import { FinishReason, GoogleGenAI, type GenerateContentResponse } from "@google/genai";

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
