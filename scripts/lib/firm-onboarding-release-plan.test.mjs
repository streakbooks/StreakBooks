import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  firmOnboardingReleaseSteps,
  FIRM_ONBOARDING_UNIT_TESTS,
  stagingGateReady,
  localReleasePreflight,
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
  it("rejects wrong origin and missing or stale origin/main", () => {
    assert.equal(localReleasePreflight({ ...trusted, originMatchesRepo: false }).passed, false);
    assert.equal(localReleasePreflight({ ...trusted, originMainCommit: null }).passed, false);
    assert.equal(localReleasePreflight({
      ...trusted, originMainCommit: "4".repeat(40),
    }).passed, false);
  });
});
