import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
export default defineConfig({
  testDir: "./e2e/coding-memory",
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8116",
    trace: "off",
    screenshot: "off",
    video: "off",
    launchOptions: { ...(executablePath ? { executablePath } : {}), args: ["--no-sandbox"] },
  },
  webServer: {
    command:
      "npx vite --config tests/fixtures/coding-memory/ui/vite.config.ts --port 8116 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:8116",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
