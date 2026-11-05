import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
export default defineConfig({
  testDir: "./e2e/public-ui",
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8105",
    launchOptions: { ...(executablePath ? { executablePath } : {}), args: ["--no-sandbox"] },
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    command: "npx vite dev --port 8105 --strictPort --host 127.0.0.1 --force",
    url: "http://127.0.0.1:8105/auth",
    reuseExistingServer: false,
    timeout: 120_000,
    // These are nonfunctional public placeholders. No account or live database is used.
    env: {
      VITE_SUPABASE_URL: "https://linkbooks-public-ui.invalid",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_public_ui_fixture_only",
      SUPABASE_URL: "https://linkbooks-public-ui.invalid",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_public_ui_fixture_only",
      VITE_CAPTCHA_PROVIDER: "",
      VITE_CAPTCHA_SITE_KEY: "",
      VITE_AUTH_OAUTH_PROVIDERS: "",
      VITE_AUTH_SSO_ENABLED: "false",
    },
  },
});
