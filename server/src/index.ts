import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { parseServerEnv } from "./env.js";
import { parsePipelineEnv } from "./pipeline/config.js";
import { createPipelineDeps, mockTtsRequested } from "./wiring.js";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
const env = parseServerEnv(process.env);
const pipelineEnv = parsePipelineEnv(process.env);
// MOCK_TTS=1 replaces only the TTS call with a beep (for working while the TTS quota is out). Never set it in production.
const mockTts = mockTtsRequested(process.env);

const app = createApp({ corsOrigins: env.CORS_ORIGIN, ...createPipelineDeps(pipelineEnv, { mockTts }) });
app.listen(env.PORT, () => {
  console.log(`server listening on :${env.PORT}`);
  if (mockTts) console.warn("MOCK_TTS=1: voices are beeps, not real speech (cache model: mock-tts)");
});
