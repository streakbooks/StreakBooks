import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  firmOnboardingReleaseSteps,
  FIRM_ONBOARDING_UNIT_TESTS,
  stagingGateReady,
  localReleasePreflight,
  extractVitestCounts,
  extractPlaywrightCounts,
  playwrightReleaseGate,
  FIRM_ONBOARDING_STAGING_TEST_COUNT,
} from "./firm-onboarding-release-plan.mjs";

describe("Firm onboarding local release plan", () => {
  it("includes all required local checks and never triggers GitHub CI", () => {
    const plan = firmOnboardingReleaseSteps();
    assert.deepEqual(
      plan.map((step) => step.id),
      ["install", "typecheck", "lint", "lookups", "navigation", "repository", "unit", "build", "bundle"],
    );
    const commands = plan.flatMap((step) => step.args).join(" ");
    assert.doesNotMatch(commands, /\bgh\s+(?:workflow|run)\b|\bworkflow\s+dispatch\b|\bgithub\s+actions\b/i);
    assert.equal(plan.filter((step) => step.id === "unit").length, 1);
    assert.equal(FIRM_ONBOARDING_UNIT_TESTS.length, 8);
    for (const file of FIRM_ONBOARDING_UNIT_TESTS) assert.match(file, /\.test\.ts$/);
  });
  it("can skip dependency installation without skipping verification commands", () => {
    const plan = firmOnboardingReleaseSteps({ install: false });
    assert.equal(plan.some((step) => step.id === "install"), false);
    assert.equal(plan.at(-1)?.id, "bundle");
    assert.equal(plan.some((step) => step.id === "unit"), true);
  });
  it("adds staging Playwright only on explicit request", () => {
    assert.equal(firmOnboardingReleaseSteps().some((step) => step.id === "staging"), false);
    const plan = firmOnboardingReleaseSteps({ staging: true });
    assert.equal(plan.at(-1)?.id, "staging");
    assert.deepEqual(plan.at(-1)?.args, [
      "run", "test:e2e", "--", "e2e/firm-onboarding-release.staging.spec.ts",
    ]);
  });
  it("fails closed on staging opt-in, identity and URL omissions", () => {
    assert.throws(() => stagingGateReady({}), /opt-ins/);
    assert.throws(() => stagingGateReady({
      E2E_STAGING_ENABLED: "true", E2E_FIRM_ONBOARDING_ENABLED: "true",
    }), /credentials/);
    const env = {
      E2E_STAGING_ENABLED: "true",
      E2E_FIRM_ONBOARDING_ENABLED: "true",
      E2E_EMAIL: "test@example.invalid",
      E2E_PASSWORD: "not-a-real-secret",
    };
    assert.throws(() => stagingGateReady(env), /URL/);
    assert.deepEqual(stagingGateReady({
      ...env,
      E2E_BASE_URL: "https://dedicated-staging.example.invalid",
      E2E_EXPECTED_STAGING_HOST: "dedicated-staging.example.invalid",
      E2E_PRODUCTION_URL: "https://production.example.invalid",
      E2E_FIRM_TASK_CSV_CANARY: "=SUM(1,1)",
      E2E_FIRM_RESTRICTED_EMAIL: "restricted@example.invalid",
      E2E_FIRM_RESTRICTED_PASSWORD: "not-a-real-other-secret",
    }), {
      stagingUrl: "https://dedicated-staging.example.invalid",
      expectedHost: "dedicated-staging.example.invalid",
      productionUrl: "https://production.example.invalid",
    });
    assert.throws(() => stagingGateReady({
      ...env,
      E2E_BASE_URL: "https://dedicated-staging.example.invalid",
      E2E_EXPECTED_STAGING_HOST: "dedicated-staging.example.invalid",
      E2E_PRODUCTION_URL: "https://production.example.invalid",
    }), /canary/);
    assert.throws(() => stagingGateReady({
      ...env,
      E2E_BASE_URL: "https://dedicated-staging.example.invalid",
      E2E_EXPECTED_STAGING_HOST: "dedicated-staging.example.invalid",
      E2E_PRODUCTION_URL: "https://production.example.invalid",
      E2E_FIRM_TASK_CSV_CANARY: "=SUM(1,1)",
    }), /distinct restricted/);
  });
});

describe("Firm onboarding release checkout trust", () => {
  const trusted = {
    branch: "main",
    commit: "3".repeat(40),
    originMainCommit: "3".repeat(40),
    originMatchesRepo: true,
    remoteRefFresh: true,
    workingTreeClean: true,
    workingTreeStatusKnown: true,
  };

  it("accepts only a clean main matching the authorized origin/main commit", () => {
    assert.deepEqual(localReleasePreflight(trusted), { passed: true, blockers: [] });
  });
  it("rejects dirty and unknown working-tree state", () => {
    assert.equal(localReleasePreflight({ ...trusted, workingTreeClean: false }).passed, false);
    assert.equal(localReleasePreflight({ ...trusted, workingTreeStatusKnown: false }).passed, false);
  });
  it("rejects detached and nonmain branches", () => {
    assert.equal(localReleasePreflight({ ...trusted, branch: "" }).passed, false);
    assert.equal(localReleasePreflight({ ...trusted, branch: "feature/new" }).passed, false);
  });
  it("rejects wrong origin, failed live fetch and missing or stale origin/main", () => {
    assert.equal(localReleasePreflight({ ...trusted, remoteRefFresh: false }).passed, false);
    assert.equal(localReleasePreflight({ ...trusted, originMatchesRepo: false }).passed, false);
    assert.equal(localReleasePreflight({ ...trusted, originMainCommit: null }).passed, false);
    assert.equal(localReleasePreflight({
      ...trusted, originMainCommit: "4".repeat(40),
    }).passed, false);
  });
});

describe("Firm onboarding release test evidence accuracy", () => {
  it("parses standard successful Vitest summary with accurate test counts", () => {
    const output = " Test Files  8 passed (8)\n      Tests  42 passed (42)\n";
    assert.deepEqual(extractVitestCounts(output), {
      passedTests: 42, failedTests: 0, skippedTests: 0,
      passedFiles: 8, failedFiles: 0, skippedFiles: 0,
    });
  });
  it("records failures and skips regardless of summary order", () => {
    const output =
      " Test Files  1 failed | 7 passed (8)\n" +
      "      Tests  2 failed | 1 skipped | 38 passed (41)\n";
    assert.deepEqual(extractVitestCounts(output), {
      passedTests: 38, failedTests: 2, skippedTests: 1,
      passedFiles: 7, failedFiles: 1, skippedFiles: 0,
    });
  });
  it("does not invent counts when no test summary exists", () => {
    assert.deepEqual(extractVitestCounts("tests never started"), {
      passedTests: null, failedTests: null, skippedTests: null,
      passedFiles: null, failedFiles: null, skippedFiles: null,
    });
  });
});

describe("Firm onboarding Playwright staging acceptance", () => {
  it("expects exactly six real dedicated staging tests", () => {
    assert.equal(FIRM_ONBOARDING_STAGING_TEST_COUNT, 6);
    assert.deepEqual(playwrightReleaseGate("  6 passed (12.2s)"), {
      passed: true,
      counts: { passed: 6, failed: 0, skipped: 0, flaky: 0, interrupted: 0, didNotRun: 0 },
    });
  });
  it("rejects an omitted or filtered browser test", () => {
    assert.equal(playwrightReleaseGate("  5 passed (9.4s)").passed, false);
    assert.equal(playwrightReleaseGate("  3 passed (5s)").passed, false);
  });
  it("rejects a skipped, failed, flaky or interrupted security test", () => {
    for (const report of [
      "  5 passed (12.2s)\n  1 skipped",
      "  6 passed (12.2s)\n  1 failed",
      "  5 passed (12.2s)\n  1 flaky",
      "  5 passed (12.2s)\n  1 interrupted",
      "  5 passed (12.2s)\n  1 did not run",
    ]) assert.equal(playwrightReleaseGate(report).passed, false);
  });
  it("strips ANSI colors and refuses missing test summary evidence", () => {
    assert.equal(playwrightReleaseGate("\u001b[32m  6 passed (2s)\u001b[0m").passed, true);
    assert.equal(playwrightReleaseGate("playwright process started").passed, false);
    assert.equal(extractPlaywrightCounts("no result"), null);
  });
});
