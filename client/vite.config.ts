import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // Workbox skips precache files over this limit (default 2 MiB). Keep music files under it (docs/SPEC.md).
      workbox: { maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 },
      manifest: {
        name: "Mumu",
        short_name: "Mumu",
        description: "A voiced manhwa reader with Mumu, the digital sidekick",
        theme_color: "#1a1c2c",
        background_color: "#1a1c2c",
        display: "standalone",
        icons: [],
      },
    }),
  ],
  server: { port: 5173 },
  // The long simulated-life tests (Mumu's engine) take ~6 s on a slow machine; the 5 s default makes them flaky.
  test: { testTimeout: 30_000 },
});
