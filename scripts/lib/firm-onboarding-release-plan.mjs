/**
 * Local-only LinkBooks Firm onboarding release gates.
 * GitHub Actions CI is intentionally never invoked.
 */
export const FIRM_ONBOARDING_UNIT_TESTS = Object.freeze([
  "src/lib/firm/client-portfolio.test.ts",
  "src/lib/firm/firm-workflows.functions.test.ts",
  "src/lib/firm/onboarding-insights.test.ts",
  "src/lib/firm/firm-onboarding-workload.test.ts",
  "src/lib/firm/firm-onboarding-workload.functions.test.ts",
  "src/lib/firm/firm-onboarding-escalations.functions.test.ts",
  "src/lib/firm/firm-onboarding-reporting.test.ts",
  "src/lib/firm/firm-onboarding-trends.functions.test.ts",
]);

export function firmOnboardingReleaseSteps({
  install = true,
  staging = false,
} = {}) {
  const steps = [];
  if (install) {
    steps.push({ id: "install", label: "Install locked dependencies", args: ["ci"] });
  }
  steps.push(
    { id: "typecheck", label: "TypeScript typecheck", args: ["run", "typecheck"] },
    { id: "lint", label: "ESLint", args: ["run", "lint"] },
    { id: "lookups", label: "Lookup architecture", args: ["run", "check:lookups"] },
    { id: "navigation", label: "Navigation contracts", args: ["run", "check:navigation"] },
    { id: "repository", label: "Repository hygiene", args: ["run", "check:repository"] },
    { id: "unit", label: "Onboarding Vitest suites", args: ["test", "--", ...FIRM_ONBOARDING_UNIT_TESTS] },
    { id: "build", label: "Production build", args: ["run", "build"] },
    { id: "bundle", label: "Client bundle check", args: ["run", "check:bundle"] },
  );
  if (staging) {
    steps.push({
      id: "staging",
      label: "Dedicated staging-only Playwright onboarding release tests",
      args: ["run", "test:e2e", "--", "e2e/firm-onboarding-release.staging.spec.ts"],
    });
  }
  return steps;
}

export function stagingGateReady(env) {
  if (env.E2E_STAGING_ENABLED !== "true" ||
      env.E2E_FIRM_ONBOARDING_ENABLED !== "true") {
    throw new Error("Explicit staging and Firm onboarding E2E opt-ins are required.");
  }
  if (!env.E2E_EMAIL || !env.E2E_PASSWORD) {
    throw new Error("Dedicated staging test credentials are required.");
  }
  if (!env.E2E_BASE_URL || !env.E2E_EXPECTED_STAGING_HOST || !env.E2E_PRODUCTION_URL) {
    throw new Error("Dedicated staging URL, expected hostname and production comparison URL required.");
  }
  // A release acceptance run must exercise both security-sensitive staging
  // gates, not silently skip the formula-injection and cross-user checks.
  if (!env.E2E_FIRM_TASK_CSV_CANARY ||
      !/^[\s]*[=+\-@]/u.test(env.E2E_FIRM_TASK_CSV_CANARY)) {
    throw new Error("Seed a formula-prefixed staging CSV canary and set E2E_FIRM_TASK_CSV_CANARY.");
  }
  if (!env.E2E_FIRM_RESTRICTED_EMAIL || !env.E2E_FIRM_RESTRICTED_PASSWORD ||
      env.E2E_FIRM_RESTRICTED_EMAIL === env.E2E_EMAIL) {
    throw new Error("A distinct restricted staging user is required for cross-client isolation.");
  }
  return {
    stagingUrl: env.E2E_BASE_URL,
    expectedHost: env.E2E_EXPECTED_STAGING_HOST,
    productionUrl: env.E2E_PRODUCTION_URL,
  };
}

/**
 * A release check must run against an unmodified, up-to-date main checkout
 * of the authoritative LinkBooks repository. A dirty/detached checkout or
 * missing origin/main reference must never produce passing release evidence.
 */
export function localReleasePreflight(git) {
  const blockers = [];
  if (!git.workingTreeStatusKnown || !git.workingTreeClean) {
    blockers.push("Working tree must be confirmed clean.");
  }
  if (git.branch !== "main") {
    blockers.push("Local branch must be main.");
  }
  if (!git.originMatchesRepo) {
    blockers.push("Origin must be the authorized LinkBooks GitHub repository.");
  }
  if (!git.commit || !git.originMainCommit || git.commit !== git.originMainCommit) {
    blockers.push("Local HEAD must match fetched origin/main. Pull the latest main first.");
  }
  return { passed: blockers.length === 0, blockers };
}
