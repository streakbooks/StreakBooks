import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const browserPath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
export default defineConfig({
  testDir: "./e2e/corrections",
  use: {
    baseURL: "http://127.0.0.1:8094",
    launchOptions: {
      ...(browserPath ? { executablePath: browserPath } : {}),
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "npx vite --config e2e/corrections/vite.config.ts",
    url: "http://127.0.0.1:8094",
    reuseExistingServer: false,
  },
});
