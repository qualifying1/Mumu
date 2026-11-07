import { FinishReason, GoogleGenAI } from "@google/genai";

/** One structured-output vision call: image + prompt in, the model's JSON text out. */
export type VisionGenerate = (args: { model: string; image: Buffer; prompt: string; jsonSchema: unknown }) => Promise<string>;

/**
 * Real Gemini adapter. Fails loudly on blocked prompts, truncated output and empty text,
 * so callers only ever see text from a call that finished normally. Never logs the request.
 */
export function createGeminiVisionGenerate(apiKey: string): VisionGenerate {
  const ai = new GoogleGenAI({ apiKey });
  return async ({ model, image, prompt, jsonSchema }) => {
    const res = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [{ inlineData: { data: image.toString("base64"), mimeType: "image/jpeg" } }, { text: prompt }],
        },
      ],
      config: { responseMimeType: "application/json", responseJsonSchema: jsonSchema, temperature: 0 },
    });

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
  };
}
