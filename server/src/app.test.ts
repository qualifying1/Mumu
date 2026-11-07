import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { parseServerEnv } from "./env.js";

describe("GET /health", () => {
  it("returns ok", async () => {
    const server = createApp({ CORS_ORIGIN: ["http://localhost:5173"] }).listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    } finally {
      server.close();
    }
  });
});

describe("parseServerEnv", () => {
  it("splits CORS origins", () => {
    const env = parseServerEnv({ PORT: "8787", CORS_ORIGIN: "http://a, http://b" });
    expect(env).toEqual({ PORT: 8787, CORS_ORIGIN: ["http://a", "http://b"] });
  });
  it("fails loudly when PORT is missing", () => {
    expect(() => parseServerEnv({ CORS_ORIGIN: "http://a" })).toThrow(/PORT/);
  });
});
