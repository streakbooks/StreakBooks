#!/usr/bin/env node
/**
 * Local Advisors release verification (AD-10).
 * Does not call GitHub Actions or mutate remotes.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";

function run(command, args, label) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    // Windows needs a shell for .cmd shims; keep Unix as direct spawn.
    shell: process.platform === "win32",
    env: process.env,
  });
  if (result.error) {
    console.error(`FAILED: ${label}`, result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`FAILED: ${label}`);
    process.exit(result.status ?? 1);
  }
}

run(npmCmd, ["run", "typecheck"], "TypeScript");
run(npmCmd, ["run", "check:ui"], "UI route contracts");
run(npmCmd, ["run", "check:bundle"], "Client bundle boundaries");
run(
  npmCmd,
  ["run", "test", "--", "--run", "src/lib/advisors"],
  "Advisors unit tests",
);
run(
  npxCmd,
  [
    "eslint",
    "--max-warnings=0",
    "src/lib/advisors",
    "src/screens/advisors",
    "src/components/advisors",
  ],
  "Advisors ESLint",
);

console.log("\nverify:advisors passed (local). GitHub CI was not run.");
