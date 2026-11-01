import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e/migration",
  use: {
    baseURL: "http://127.0.0.1:8092",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "npx vite --config e2e/migration/vite.config.ts",
    url: "http://127.0.0.1:8092",
    reuseExistingServer: false,
  },
});
