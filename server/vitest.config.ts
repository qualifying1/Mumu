import { defineConfig } from "vitest/config";

// Several tests spawn the real ffmpeg binary. On some machines (antivirus
// scanning the unsigned exe) each launch takes seconds, so the 5 s default
// would fail tests that are correct. 60 s is generous but still catches hangs.
export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
