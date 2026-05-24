import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config for the Escape Room app.
 *
 * Runs against the local dev server (http://localhost:3000) which talks to
 * the local Supabase stack. The `webServer` block starts `npm run dev`
 * automatically if it isn't already running, so `npm run test:e2e` works
 * from a cold start — just make sure Docker + Supabase are up first.
 *
 * Auth note: local Supabase has email confirmations disabled
 * (supabase/config.toml → enable_confirmations = false), so tests can sign
 * up a fresh user and use it immediately without an inbox round-trip.
 */
export default defineConfig({
  testDir: "./e2e",
  // One worker against a single dev server keeps things deterministic and
  // easy to watch; the suite is small enough that serial is fine.
  fullyParallel: false,
  workers: 1,
  // Dev-server cold compiles (Turbopack) can make the first hit to a route
  // slow; one retry absorbs that without masking real failures.
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
