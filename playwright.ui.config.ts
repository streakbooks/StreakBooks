import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
export default defineConfig({
  testDir: "./e2e/ui",
  timeout: 30000,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8100",
    launchOptions: { ...(executablePath ? { executablePath } : {}), args: ["--no-sandbox"] },
  },
  webServer: {
    command: "npx vite --config e2e/ui/vite.config.ts",
    url: "http://127.0.0.1:8100",
    reuseExistingServer: false,
  },
});
