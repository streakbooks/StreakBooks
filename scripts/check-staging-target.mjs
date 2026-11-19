import { validateStagingEnvironment } from "./lib/staging-target.mjs";

try {
  validateStagingEnvironment(process.env);
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
