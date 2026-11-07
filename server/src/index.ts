import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { parseServerEnv } from "./env.js";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
const env = parseServerEnv(process.env);
createApp(env).listen(env.PORT, () => {
  console.log(`server listening on :${env.PORT}`);
});
