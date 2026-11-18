import { defineConfig, devices } from "@playwright/test";

const hasAccount = Boolean(
  (process.env.E2E_EMAIL && process.env.E2E_PASSWORD) || process.env.E2E_PLATFORM_STORAGE_STATE,
);

/**
 * Authenticated LookupSelect checks. They sign in through /auth.
 * Without E2E_EMAIL and E2E_PASSWORD the suite skips and does not start a browser.
 */
export default defineConfig({
  testDir: "./e2e",
  testIgnore: [
    "**/banking-local-api/**",
    "**/coding-memory/**",
    "**/voice/**",
    "**/migration/**",
    "**/practice/**",
    "**/corrections/**",
    "**/themes/**",
    "**/ui/**",
    "**/public-ui/**",
    "**/create-panels/**",
    "**/reporting/**",
    "**/navigation/**",
    "**/platform/**",
  ],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 60_000,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:8080",
    // Staging financial previews can contain confidential data; never capture CI traces.
    trace: process.env.E2E_STAGING_RUN === "true" ? "off" : "on-first-retry",
    screenshot: "off",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Against a configured staging URL, never start a competing local dev server.
  webServer:
    hasAccount && !process.env.E2E_BASE_URL
      ? {
          command: "npm run dev -- --port 8080 --strictPort --host 127.0.0.1",
          url: "http://127.0.0.1:8080",
          reuseExistingServer: true,
          timeout: 120_000,
        }
      : undefined,
});
