import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

/**
 * Authenticated billing lifecycle E2E against a running app (local or staging).
 * Does not start a fixture Vite server — point baseURL at the real app.
 *
 *   E2E_BILLING_ENABLED=true E2E_EMAIL=… E2E_PASSWORD=… npm run test:billing:live
 */
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);

export default defineConfig({
  testDir: "./e2e/billing",
  testMatch: /subscription-lifecycle\.live\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: ["--no-sandbox"],
    },
  },
});
