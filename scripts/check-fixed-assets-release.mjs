#!/usr/bin/env node
/**
 * Fixed Assets non-CI release gate (local, read-only with respect to GitHub).
 *
 * Runs existing project commands. It never commits, merges, fetches, pushes,
 * runs a remote workflow, applies migrations or deploys. A pass means only
 * these local commands passed on the exact worktree that was tested.
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
  { name: "UI contracts", args: ["run", "check:ui"] },
  { name: "Lookup contracts", args: ["run", "check:lookups"] },
  { name: "Navigation contracts", args: ["run", "check:navigation"] },
  { name: "Production build", args: ["run", "build"] },
];

function run(command, args, opts = {}) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    ...opts,
  });
}

function npmTask(args) {
  if (isWindows) {
    // All arguments are fixed, trusted literals above; no user input is
    // interpolated into the Windows shell command.
    return run("cmd.exe", ["/d", "/s", "/c", "npm.cmd " + args.join(" ")], {
      stdio: "inherit",
    });
  }
  return run("npm", args, { stdio: "inherit" });
}

if (process.argv.slice(2).length) {
  console.error("Usage: node scripts/check-fixed-assets-release.mjs (no arguments)");
  process.exit(2);
}

console.log("\nLinkBooks Fixed Assets — local release verification");
console.log("This command cannot trigger GitHub Actions, merge a PR, or deploy.");
const currentRepo = run("git", ["config", "--get", "remote.origin.url"]);
const origin = (currentRepo.stdout ?? "").trim();
if (currentRepo.status !== 0 ||
    !/^((https:\/\/|ssh:\/\/git@)github\.com\/|git@github\.com:|https:\/\/[^@]+@github\.com\/)(linkbusinessadvisory\/LinkBooks)(\.git)?\/?$/i.test(origin)) {
  console.error("Refusing to run: Git origin is not the authoritative linkbusinessadvisory/LinkBooks repository.");
  console.error("Current origin:", origin || "(missing)");
  process.exit(2);
}

const branch = run("git", ["branch", "--show-current"]).stdout?.trim() || "(detached)";
const sha = run("git", ["rev-parse", "--short=12", "HEAD"]).stdout?.trim() || "(unknown)";
const worktree = run("git", ["status", "--porcelain"]);
if (worktree.status !== 0) {
  console.error("Could not inspect the local worktree.");
  process.exit(2);
}
console.log("Git origin:", origin);
console.log("Branch:", branch);
console.log("Commit:", sha);
if ((worktree.stdout ?? "").trim()) {
  console.warn("WARNING: Worktree has uncommitted/untracked changes; results may include unfinished local edits.");
} else {
  console.log("Working tree: clean");
}
console.log("Tests are run against this local tree only; no main integration, staging or deployment is implied.\n");

const results = [];
for (const task of tasks) {
  console.log("\n" + "=".repeat(68));
  console.log("RUNNING:", task.name, "(npm " + task.args.join(" ") + ")");
  console.log("=".repeat(68));
  const started = Date.now();
  const result = npmTask(task.args);
  const elapsed = Math.round((Date.now() - started) / 1000);
  const ok = !result.error && result.status === 0;
  results.push({ name: task.name, ok, seconds: elapsed, code: result.status });
  if (result.error) console.error("Execution error:", result.error.message);
  console.log(task.name + ": " + (ok ? "PASS" : "FAIL") + " (" + elapsed + "s)");
}

console.log("\nFixed Assets release gate — local verification summary");
for (const item of results) {
  console.log((item.ok ? "PASS" : "FAIL") + " | " + item.name + " | " + item.seconds + "s" +
    (item.ok ? "" : " | exit " + (item.code ?? "unable to start")));
}
const passed = results.filter((item) => item.ok).length;
console.log("Result:", passed + " / " + results.length + " checks passed.");
console.log("Not included: authenticated browser, RLS, posting/FX integration, full suite, staging, CI, PR merge, deployment.");
if (passed !== results.length) {
  console.error("Local release gate FAILED. Do not merge or deploy based on these results.");
  process.exitCode = 1;
} else {
  console.log("Local release gate PASSED. This is not production-readiness or merge approval.");
}
