import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
export default defineConfig({
  testDir: "./e2e/create-panels",
  timeout: 30000,
  workers: 1,
  reporter: "list",
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:8107",
    launchOptions: { ...(executablePath ? { executablePath } : {}), args: ["--no-sandbox"] },
  },
  webServer: {
    command: "npx vite --config e2e/create-panels/vite.config.ts",
    url: "http://127.0.0.1:8107",
    reuseExistingServer: false,
  },
});
