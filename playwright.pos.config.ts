import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e/pos",
  workers: 1,
  timeout: 30000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8105",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "npx vite --config e2e/pos/vite.config.ts",
    url: "http://127.0.0.1:8105",
    reuseExistingServer: false,
  },
});
