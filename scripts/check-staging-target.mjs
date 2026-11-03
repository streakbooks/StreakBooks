import { validateStagingTarget } from "./lib/staging-target.mjs";

try {
  if (process.env.E2E_STAGING_ENABLED !== "true") {
    throw new Error("Set E2E_STAGING_ENABLED=true explicitly to run staging browser tests.");
  }
  validateStagingTarget({
    stagingUrl: process.env.E2E_BASE_URL,
    expectedHost: process.env.E2E_EXPECTED_STAGING_HOST,
    productionUrl: process.env.E2E_PRODUCTION_URL,
  });
  if (!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD) {
    throw new Error("Dedicated E2E staging account credentials are required.");
  }
  // Do not log the staging URL, usernames, tokens, or passwords.
  process.stdout.write("Staging target, production separation and credentials verified.\n");
} catch (error) {
  process.stderr.write(
    "Staging preflight blocked: " +
      (error instanceof Error ? error.message : "Unknown error") +
      "\n",
  );
  process.exitCode = 1;
}
