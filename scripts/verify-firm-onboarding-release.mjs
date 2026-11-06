#!/usr/bin/env node
/**
 * Run release evidence locally, without interacting with GitHub CI.
 * Writes an explicit JSON report even when a check fails.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  firmOnboardingReleaseSteps,
  localReleasePreflight,
  extractVitestCounts,
  playwrightReleaseGate,
  FIRM_ONBOARDING_UNIT_TESTS,
  stagingGateReady,
} from "./lib/firm-onboarding-release-plan.mjs";
import { validateStagingTarget } from "./lib/staging-target.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const allowed = new Set(["--skip-install", "--staging", "--dry-run", "--help"]);
const badArg = args.find((arg) => !allowed.has(arg));
if (badArg) {
  console.error("Unsupported argument: " + badArg);
  console.error("Usage: node scripts/verify-firm-onboarding-release.mjs [--skip-install] [--staging] [--dry-run]");
  process.exitCode = 2;
} else if (args.includes("--help")) {
  console.log("Usage: node scripts/verify-firm-onboarding-release.mjs [--skip-install] [--staging] [--dry-run]");
  console.log("--staging requires a dedicated HTTPS staging host and seeded, authorized test accounts.");
  console.log("This script never triggers GitHub CI or writes release approval.");
} else {
  const useStaging = args.includes("--staging");
  const dryRun = args.includes("--dry-run");
  if (useStaging) {
    try {
      validateStagingTarget(stagingGateReady(process.env));
    } catch (error) {
      console.error("Staging release gate refused: " + error.message);
      process.exitCode = 2;
    }
  }
  if (!process.exitCode) {
    await runRelease({ useStaging, dryRun, install: !args.includes("--skip-install") });
  }
}

function gitInfo() {
  function git(...subArgs) {
    const result = spawnSync("git", subArgs, { cwd: root, encoding: "utf8" });
    return result.status === 0 ? (result.stdout || "").trim() : null;
  }
  const status = git("status", "--porcelain");
  const remoteUrl = git("remote", "get-url", "origin");
  // Never put a remote URL into the JSON report: it could contain credentials.
  const originMatchesRepo = typeof remoteUrl === "string" &&
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)linkbusinessadvisory\/LinkBooks(?:\.git)?\/?$/i.test(remoteUrl);
  return {
    commit: git("rev-parse", "HEAD"),
    originMainCommit: git("rev-parse", "--verify", "refs/remotes/origin/main"),
    originMatchesRepo,
    branch: git("branch", "--show-current"),
    workingTreeClean: status === "",
    workingTreeStatusKnown: status !== null,
  };
}

/**
 * Fetch main from the authorized origin immediately before and after testing.
 * Never cache a stale remote ref as proof that local HEAD is up to date.
 * This is a read-only Git fetch, NOT a GitHub CI or Actions workflow call.
 */
function refreshRemoteMain() {
  const result = spawnSync("git", [
    "fetch", "--no-tags", "origin",
    "refs/heads/main:refs/remotes/origin/main",
  ], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    // Do not print Git remote/error output: a malformed remote could expose credentials.
    stdio: ["ignore", "ignore", "ignore"],
  });
  return result.status === 0 && !result.error;
}

function npmLaunch(npmArgs) {
  if (process.platform === "win32") {
    // Windows requires cmd.exe for npm.cmd. Arguments here are code-defined,
    // never interpolated from user-controlled CLI inputs.
    return {
      cmd: "cmd.exe",
      args: ["/d", "/s", "/c", "npm.cmd " + npmArgs.map((part) =>
        '"' + part.replaceAll('"', '""') + '"',
      ).join(" ")],
    };
  }
  return { cmd: "npm", args: npmArgs };
}

async function runNpmStep(step) {
  const started = Date.now();
  const spec = npmLaunch(step.args);
  console.log("\n>>> " + step.label + ": npm " + step.args.join(" "));
  return await new Promise((resolve) => {
    let output = "";
    let complete = false;
    const child = spawn(spec.cmd, spec.args, {
      cwd: root,
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
      windowsHide: true,
    });
    function capture(data, stream) {
      const chunk = String(data);
      stream.write(chunk);
      // Capture a bounded tail for count extraction. Never store raw logs.
      output = (output + chunk).slice(-30000);
    }
    child.stdout?.on("data", (part) => capture(part, process.stdout));
    child.stderr?.on("data", (part) => capture(part, process.stderr));
    function finish(result) {
      if (complete) return;
      complete = true;
      resolve({
        id: step.id,
        label: step.label,
        status: result.status,
        exitCode: result.exitCode,
        durationSeconds: Math.round((Date.now() - started) / 1000),
        ...(step.id === "unit" ? { vitest: extractVitestCounts(output) } : {}),
        ...(step.id === "staging" ? { playwright: playwrightReleaseGate(output).counts } : {}),
      });
    }
    child.on("error", (error) => {
      console.error("Unable to start check " + step.id + ": " + error.message);
      finish({ status: "failed", exitCode: null });
    });
    child.on("close", (code, signal) => {
      // A green process exit alone is insufficient if Vitest did not actually
      // execute every required suite or silently skipped tests.
      const counts = step.id === "unit" ? extractVitestCounts(output) : null;
      const unitsVerified = !counts ||
        (counts.passedFiles === FIRM_ONBOARDING_UNIT_TESTS.length &&
          counts.passedTests !== null && counts.passedTests > 0 &&
          counts.failedFiles === 0 && counts.failedTests === 0 &&
          counts.skippedFiles === 0 && counts.skippedTests === 0);
      const stagingVerified = step.id !== "staging" ||
        playwrightReleaseGate(output).passed;
      finish({
        status: code === 0 && unitsVerified && stagingVerified ? "passed" : "failed",
        exitCode: code ?? (signal ? -1 : null),
      });
    });
  });
}

async function runRelease({ useStaging, dryRun, install }) {
  const plan = firmOnboardingReleaseSteps({ install, staging: useStaging });
  const initialRemoteFresh = !dryRun && refreshRemoteMain();
  const git = { ...gitInfo(), remoteRefFresh: initialRemoteFresh };
  const preflight = localReleasePreflight(git);
  const results = [];
  const now = new Date();
  // Each run gets a distinct evidence file; a dry run cannot overwrite a
  // previous real test report from the same calendar day.
  const reportId = now.toISOString().replace(/[:.]/g, "-") + "-" +
    (git.commit?.slice(0, 8) ?? "unknown");
  const reportPath = path.join(
    root, "artifacts", "firm-onboarding-local-release-" + reportId + ".json",
  );
  console.log("Firm onboarding local verification — no GitHub CI");
  console.log("Repository:", root, "commit:", git.commit || "unknown");
  if (!preflight.passed) {
    console.error("RELEASE PREFLIGHT BLOCKED: " + preflight.blockers.join(" "));
  }
  if (!dryRun && !preflight.passed) {
    for (const step of plan) {
      results.push({ id: step.id, label: step.label, status: "blocked", exitCode: null });
    }
  } else {
    for (const step of plan) {
      if (dryRun) {
        console.log("PLANNED: npm " + step.args.join(" "));
        results.push({ id: step.id, label: step.label, status: "planned", exitCode: null });
        continue;
      }
      const result = await runNpmStep(step);
      results.push(result);
      if (step.id === "install" && result.status !== "passed") {
        console.error("Dependency installation failed; later commands cannot be trusted.");
        for (const later of plan.slice(results.length)) {
          results.push({ id: later.id, label: later.label, status: "blocked", exitCode: null });
        }
        break;
      }
    }
  }
  const finalRemoteFresh = !dryRun && refreshRemoteMain();
  const finalGit = { ...gitInfo(), remoteRefFresh: finalRemoteFresh };
  const postflight = localReleasePreflight(finalGit);
  const checksPassed = !dryRun && preflight.passed && postflight.passed &&
    results.length === plan.length &&
    results.every((result) => result.status === "passed");
  const report = {
    module: "Firm & Clients — onboarding release",
    generatedAt: new Date().toISOString(),
    repo: "linkbusinessadvisory/LinkBooks",
    git: finalGit,
    preflight,
    postflight,
    liveOriginMainFetch: {
      beforeTesting: initialRemoteFresh,
      afterTesting: finalRemoteFresh,
    },
    sourceChecksPassed: checksPassed,
    stagingE2EIncluded: useStaging,
    stagingE2EPassed: useStaging && results.some((r) => r.id === "staging" && r.status === "passed"),
    githubCI: "Not run (per user instruction)",
    databaseSqlSuites: "Verified separately against Supabase; not executed by this script",
    scheduledCronExecution: "Not verified by local script",
    vercelStagingDeployment: "Not verified by local script",
    vercelProductionDeployment: "Not verified by local script",
    productionReady: false,
    releaseVerdict: "BLOCKED pending live cron, deployment and role-based QA evidence",
    steps: results,
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  console.log("\nVerification JSON: " + reportPath);
  console.log("Local checks: " + (checksPassed ? "passed" : "NOT ALL PASSED"));
  console.log("Release verdict: BLOCKED until cron + deployment + manual staging evidence verified");
  if (!dryRun && !checksPassed) process.exitCode = preflight.passed ? 1 : 2;
}
