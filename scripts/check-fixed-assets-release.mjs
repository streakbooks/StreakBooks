#!/usr/bin/env node
/**
 * StreakBooks Fixed Assets — local, non-CI release verification.
 *
 * Fail closed before running tests unless on a CLEAN authoritative main
 * checkout at exactly the locally fetched origin/main SHA. No network,
 * fetch/push, migration, deployment or GitHub workflow is initiated.
 *
 * A pass verifies only the listed local checks. Authenticated RLS, journals,
 * browser QA, staging and production deployment are separate release gates.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const tasks = [
  { name: "TypeScript", args: ["run", "typecheck"] },
  { name: "ESLint", args: ["run", "lint"] },
  { name: "Fixed Assets Vitest", args: ["test", "--", "src/lib/fixed-assets/"] },
  { name: "Full Vitest suite", args: ["test"] },
  { name: "UI contracts", args: ["run", "check:ui"] },
  { name: "Lookup contracts", args: ["run", "check:lookups"] },
  { name: "Navigation contracts", args: ["run", "check:navigation"] },
  { name: "Production build", args: ["run", "build"] },
  { name: "Client bundle audit", args: ["run", "check:bundle"] },
];

function run(command, args, opts = {}) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    ...opts,
  });
}

function git(args) {
  const result = run("git", args);
  return result.status === 0 && !result.error ? (result.stdout ?? "").trim() : null;
}

function refuse(reason) {
  console.error("LOCAL RELEASE GATE BLOCKED:", reason);
  console.error("No npm checks were run. No GitHub CI, deployment or SQL changes were made.");
  process.exit(2);
}

function npmTask(args) {
  if (isWindows) {
    // No interpolated user input: every task is a trusted, fixed argument list.
    return run("cmd.exe", ["/d", "/s", "/c", "npm.cmd " + args.join(" ")], {
      stdio: "inherit",
    });
  }
  return run("npm", args, { stdio: "inherit" });
}

if (process.argv.length !== 2) {
  console.error("Usage: node scripts/check-fixed-assets-release.mjs (no arguments)");
  process.exit(2);
}

console.log("\nStreakBooks Fixed Assets — local non-CI release verification");

// Do not log the origin URL: it may contain a credential.
const origin = git(["config", "--get", "remote.origin.url"]);
const authoritative =
  /^((https:\/\/|ssh:\/\/git@)github\.com\/|git@github\.com:|https:\/\/[^@]+@github\.com\/)(linkbusinessadvisory\/StreakBooks)(\.git)?\/?$/i;
if (origin === null || !authoritative.test(origin)) {
  refuse("Git origin is not streakbooks/StreakBooks.");
}

const root = git(["rev-parse", "--show-toplevel"]);
if (root === null || resolve(root).toLowerCase() !== repoRoot.toLowerCase()) {
  refuse("Script must run from the authoritative repository checkout.");
}

const branch = git(["branch", "--show-current"]);
if (branch !== "main")
  refuse("Check out main. Feature or detached branches cannot pass the release gate.");

const worktree = git(["status", "--porcelain=v1", "--untracked-files=normal"]);
if (worktree === null) refuse("Cannot inspect local Git status.");
if (worktree !== "") refuse("Working tree has uncommitted or untracked changes.");

const sha = git(["rev-parse", "--verify", "HEAD"]);
const trackedMain = git(["rev-parse", "--verify", "refs/remotes/origin/main"]);
if (sha === null || trackedMain === null) {
  refuse("Missing HEAD or origin/main. Run git fetch origin first.");
}
if (sha !== trackedMain) {
  refuse(
    "Local main does not exactly match fetched origin/main. Fetch and fast-forward main first.",
  );
}

console.log("Repository: streakbooks/StreakBooks (origin verified; URL hidden)");
console.log("Branch: main (verified clean)");
console.log("Local HEAD: " + sha);
console.log("Fetched origin/main: " + trackedMain);
console.log(
  "NOTE: origin/main is the LOCAL tracking ref; it may be stale if you have not fetched.",
);
console.log("No network access, GitHub Actions/CI, migrations or deployment are invoked.\n");

const results = [];
for (const task of tasks) {
  console.log("\n" + "=".repeat(68));
  console.log("RUNNING:", task.name, "(npm " + task.args.join(" ") + ")");
  console.log("=".repeat(68));
  const started = Date.now();
  const result = npmTask(task.args);
  const seconds = Math.round((Date.now() - started) / 1000);
  const ok = !result.error && result.status === 0;
  results.push({ name: task.name, ok, seconds, code: result.status });
  if (result.error) console.error("Execution error:", result.error.message);
  console.log(task.name + ": " + (ok ? "PASS" : "FAIL") + " (" + seconds + "s)");
}

console.log("\nFixed Assets release gate — local verification summary");
for (const item of results) {
  console.log(
    (item.ok ? "PASS" : "FAIL") +
      " | " +
      item.name +
      " | " +
      item.seconds +
      "s" +
      (item.ok ? "" : " | exit " + (item.code ?? "unable to start")),
  );
}
const passed = results.filter((item) => item.ok).length;

// A test or build can modify generated/tracked files, create untracked output,
// or change the Git checkout. Never issue a "PASSED" release result if any
// preflight invariant changed while npm commands were executing.
const finalBranch = git(["branch", "--show-current"]);
const finalHead = git(["rev-parse", "--verify", "HEAD"]);
const finalTrackedMain = git(["rev-parse", "--verify", "refs/remotes/origin/main"]);
const finalWorktree = git(["status", "--porcelain=v1", "--untracked-files=normal"]);
const statePreserved =
  finalBranch === "main" &&
  finalHead === sha &&
  finalTrackedMain === trackedMain &&
  finalWorktree === "";
if (!statePreserved) {
  console.error(
    "FINAL GIT CHECK FAILED: branch, commit, origin/main or working tree changed during verification.",
  );
  console.error("Results are not accepted for release, even if the npm tasks themselves passed.");
}
console.log("Result:", passed + " / " + results.length + " checks passed.");
console.log("Final Git state:", statePreserved ? "UNCHANGED" : "CHANGED — release gate blocked");
console.log(
  "NOT VERIFIED HERE: authenticated browser, RLS, accounting posting/FX, staging, production deployment.",
);
if (passed !== results.length || !statePreserved) {
  console.error("Local release gate FAILED. Full QA and production readiness remain unverified.");
  process.exitCode = 1;
} else {
  console.log("Local release gate PASSED for the printed commit only.");
  console.log("This does NOT certify browser, database, staging or production readiness.");
}
