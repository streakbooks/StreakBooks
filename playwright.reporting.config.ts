import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const browserPath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
export default defineConfig({
  testDir: "./e2e/reporting",
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:8098",
    launchOptions: {
      ...(browserPath ? { executablePath: browserPath } : {}),
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "npx vite --config e2e/reporting/vite.config.ts",
    url: "http://127.0.0.1:8098",
    reuseExistingServer: false,
  },
});
