#!/usr/bin/env node
/**
 * LinkBooks Accounting Reconciliation release verification: LOCAL ONLY.
 * Never starts GitHub Actions / CI, changes Supabase, or deploys Vercel.
 * A source-complete branch and passing npm checks are NOT production approval.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REVIEW_MIGRATIONS, RECONCILIATION_TEST_FILES,
  accountingReleaseSteps, verifyVitestStep,
  migrationSourceCheck, accountingReleasePreflight,
  accountingReleaseDecision,
} from "./lib/accounting-reconciliation-release-plan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flags = new Set(["--dry-run", "--skip-install", "--help"]);
const invalid = args.find(arg => !flags.has(arg));
if (invalid) {
  console.error("Unsupported argument: " + invalid);
  process.exitCode = 2;
} else if (args.includes("--help")) {
  console.log("Usage: node scripts/verify-accounting-reconciliation-release.mjs [--dry-run] [--skip-install]");
  console.log("Runs only local non-GitHub-CI checks; no Supabase writes or Vercel deployment.");
  console.log("Always blocks production approval until authenticated staging/deployment checks are independently verified.");
} else {
  await main({
    dryRun: args.includes("--dry-run"),
    install: !args.includes("--skip-install"),
  });
}

function git(...args) {
  const result = spawnSync("git", args, {
    cwd: root, encoding: "utf8", windowsHide: true,
    timeout: 45000, stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0 ? (result.stdout ?? "").trim() : null;
}
function gitInfo(fresh) {
  const remote = git("remote", "get-url", "origin");
  const clean = git("status", "--porcelain");
  return {
    branch: git("branch", "--show-current"),
    commit: git("rev-parse", "HEAD"),
    originMainCommit: git("rev-parse", "--verify", "refs/remotes/origin/main"),
    workingTreeStatusKnown: clean !== null,
    workingTreeClean: clean === "",
    remoteRefFresh: fresh,
    // Never record remote URL: URLs can embed credentials.
    originMatchesRepo: typeof remote === "string" &&
      /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)linkbusinessadvisory\/LinkBooks(?:\.git)?\/?$/i.test(remote),
  };
}
function refreshMain() {
  const result = spawnSync("git", [
    "fetch", "--no-tags", "origin",
    "refs/heads/main:refs/remotes/origin/main",
  ], {
    cwd: root, stdio: "ignore", windowsHide: true, timeout: 90000,
  });
  return result.status === 0 && !result.error;
}
async function migrationEvidence() {
  const contents = {};
  const digest = {};
  for (const item of REVIEW_MIGRATIONS) {
    try {
      const source = await readFile(path.join(root, item.path), "utf8");
      contents[item.path] = source;
      digest[item.path] = createHash("sha256").update(source).digest("hex");
    } catch { contents[item.path] = null; }
  }
  const status = migrationSourceCheck(contents);
  let testsPresent = true;
  for (const relative of RECONCILIATION_TEST_FILES) {
    try {
      if (!(await stat(path.join(root, relative))).isFile()) testsPresent = false;
    } catch { testsPresent = false; }
  }
  return { status, digest, testsPresent };
}
function npmSpec(args) {
  if (process.platform !== "win32") return { file: "npm", args };
  // All arguments come from static, source-defined test plans.
  const quoted = args.map(x => '"' + x.replaceAll('"', '""') + '"').join(" ");
  return { file: "cmd.exe", args: ["/d", "/s", "/c", "npm.cmd " + quoted] };
}
async function performStep(step) {
  const started = Date.now();
  const { file, args } = npmSpec(step.args);
  console.log("\n>>> " + step.id + ": npm " + step.args.join(" "));
  const response = await new Promise(resolve => {
    const child = spawn(file, args, {
      cwd: root, env: process.env,
      stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
    let buffer = "";
    let settled = false;
    function done(exitCode) {
      if (settled) return;
      settled = true;
      resolve({ exitCode, output: buffer });
    }
    function capture(chunk, stream) {
      stream.write(chunk);
      buffer = (buffer + String(chunk)).slice(-40000);
    }
    child.stdout?.on("data", x => capture(x, process.stdout));
    child.stderr?.on("data", x => capture(x, process.stderr));
    child.on("error", () => done(null));
    child.on("close", code => done(code));
  });
  const verification = ["focused", "full_unit"].includes(step.id)
    ? verifyVitestStep({
      exitCode: response.exitCode, output: response.output,
      expectedFiles: step.id === "focused" ? RECONCILIATION_TEST_FILES.length : null,
    }) : null;
  return {
    id: step.id,
    status: verification ? (verification.passed ? "passed" : "failed") :
      response.exitCode === 0 ? "passed" : "failed",
    exitCode: response.exitCode,
    seconds: Math.round((Date.now() - started) / 1000),
    ...(verification ? { vitest: verification.counts } : {}),
  };
}

async function main({ dryRun, install }) {
  const plan = accountingReleaseSteps({ install });
  // Never fetch from untrusted git remotes.
  const before = gitInfo(false);
  const fresh = !dryRun && before.originMatchesRepo && refreshMain();
  const migration = await migrationEvidence();
  const preflight = accountingReleasePreflight(
    gitInfo(fresh), migration.status, migration.testsPresent,
  );
  const results = [];
  console.log("LinkBooks Accounting reconciliation local verification (no GitHub CI)");
  if (!preflight.passed) {
    console.error("Preflight blockers:", preflight.blockers.join(" | "));
  }
  for (const step of plan) {
    if (dryRun) {
      console.log("PLANNED: npm " + step.args.join(" "));
      results.push({ id: step.id, status: "planned" });
      continue;
    }
    if (!preflight.passed || (step.id !== "install" &&
        results.some(x => x.id === "install" && x.status !== "passed"))) {
      results.push({ id: step.id, status: "blocked" });
      continue;
    }
    results.push(await performStep(step));
  }
  const beforeFinal = gitInfo(false);
  const finalFresh = !dryRun && beforeFinal.originMatchesRepo && refreshMain();
  const postflight = accountingReleasePreflight(
    gitInfo(finalFresh), migration.status, migration.testsPresent,
  );
  const decision = accountingReleaseDecision({
    preflight, postflight, steps: results, plan, dryRun,
  });
  const report = {
    workstream: "Accounting Reconciliation — Fixed Assets + persistent reviews",
    generatedAt: new Date().toISOString(),
    repository: "linkbusinessadvisory/LinkBooks",
    git: gitInfo(finalFresh),
    preflight, postflight,
    migrationSource: migration.status,
    migrationDigests: migration.digest,
    requiredFocusedTestFiles: RECONCILIATION_TEST_FILES.length,
    steps: results,
    githubCI: "Not run (per user instruction)",
    supabaseLiveMigration: "NOT APPLIED OR VERIFIED BY THIS SCRIPT",
    rlsAuthenticatedIntegration: "NOT VERIFIED BY THIS SCRIPT",
    stagingBrowserE2E: "NOT VERIFIED BY THIS SCRIPT",
    vercelDeployment: "NOT VERIFIED BY THIS SCRIPT",
    ...decision,
  };
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = path.join(root, "artifacts",
    "accounting-reconciliation-release-" + timestamp + ".json");
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  console.log("\nRelease evidence: " + destination);
  console.log("Local checks: " + (decision.localChecksPassed ? "passed" : "NOT VERIFIED"));
  console.log("Production readiness: BLOCKED pending staging migration/RLS, E2E and deployment.");
  if (!decision.localChecksPassed && !dryRun) process.exitCode = preflight.passed ? 1 : 2;
}
