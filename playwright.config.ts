import { defineConfig } from "@playwright/test";

// End-to-end tests of the built extension (dist/) in a real Chromium — see
// e2e/fixtures.ts. Run `npm run build` first; `npm run test:e2e` does both.
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  // Each test launches its own persistent browser context with the extension
  // loaded; keep it to one worker so they don't fight over CPU on small CI boxes.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    trace: "retain-on-failure",
  },
});
