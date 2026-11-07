import cors from "cors";
import express from "express";
import type { ServerEnv } from "./env.js";

export function createApp(env: Pick<ServerEnv, "CORS_ORIGIN">) {
  const app = express();
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}
