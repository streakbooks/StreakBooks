import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

/**
 * Hybrid staging E2E (India Razorpay + UK/US Stripe) against a running app.
 *
 *   E2E_BILLING_ENABLED=true \
 *   E2E_IN_EMAIL=… E2E_IN_PASSWORD=… \
 *   E2E_GB_EMAIL=… E2E_GB_PASSWORD=… \
 *   E2E_US_EMAIL=… E2E_US_PASSWORD=… \
 *   E2E_BASE_URL=http://localhost:8080 \
 *   npm run test:billing:hybrid
 */
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);

export default defineConfig({
  testDir: "./e2e/billing",
  testMatch: /hybrid-staging\.live\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 25_000 },
  retries: 0,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/hybrid-billing-results.json" }]],
  outputDir: "test-results/hybrid-billing",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: ["--no-sandbox"],
    },
  },
});
