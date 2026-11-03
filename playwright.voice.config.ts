import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/voice",
  testMatch: "**/voice.spec.ts",
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env["CI"]),
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8081",
    trace: "retain-on-failure",
    launchOptions: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
      ? { executablePath: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] }
      : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx vite --config e2e/voice/vite.config.ts --port 8081 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:8081",
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },
});
