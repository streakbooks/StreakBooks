import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const baseURL = "http://127.0.0.1:8098";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
/** Real API tests require an explicitly started, isolated localhost app/Supabase. */
export default defineConfig({
  testDir: "./e2e/banking-local-api",
  globalSetup: "./e2e/banking-local-api/setup.ts",
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: "list",
  use: {
    baseURL,
    trace: "off",
    screenshot: "off",
    video: "off",
    launchOptions: { ...(executablePath ? { executablePath } : {}), args: ["--no-sandbox"] },
  },
});
