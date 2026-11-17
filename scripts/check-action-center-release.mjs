#!/usr/bin/env node
/**
 * Usage: node scripts/check-action-center-release.mjs <vercel-record.json> <approved-main-sha>
 * Accepts one fresh, unmodified Vercel API deployment JSON record.
 * Does not contact Vercel or deploy. Never supply API tokens or credentials.
 */
import { readFile } from "node:fs/promises";
import { validateActionCenterDeployment } from "./lib/action-center-release-gate.mjs";

const [filePath, approvedSha] = process.argv.slice(2);
if (!filePath || !approvedSha) {
  console.error(
    "Usage: node scripts/check-action-center-release.mjs <vercel-record.json> <approved-main-sha>",
  );
  process.exitCode = 2;
} else {
  try {
    const raw = await readFile(filePath, "utf8");
    const deployment = JSON.parse(raw);
    const evidence = validateActionCenterDeployment(deployment, approvedSha);
    console.log(JSON.stringify({ releaseMetadataCheck: "PASS", ...evidence }, null, 2));
    console.log(
      "A passing metadata check alone does not verify live smoke tests or production readiness.",
    );
  } catch (error) {
    console.error(
      "Action Center deployment verification FAILED:",
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  }
}
