/**
 * Local-only StreakBooks Firm onboarding release gates.
 * GitHub Actions CI is intentionally never invoked.
 */
// Six tests in e2e/firm-onboarding-release.staging.spec.ts; an unexpectedly
// skipped or omitted security test cannot count as passing staging acceptance.
export const FIRM_ONBOARDING_STAGING_TEST_COUNT = 6;

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

export function firmOnboardingReleaseSteps({ install = true, staging = false } = {}) {
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
    {
      id: "unit",
      label: "Onboarding Vitest suites",
      args: ["test", "--", ...FIRM_ONBOARDING_UNIT_TESTS],
    },
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
  if (env.E2E_STAGING_ENABLED !== "true" || env.E2E_FIRM_ONBOARDING_ENABLED !== "true") {
    throw new Error("Explicit staging and Firm onboarding E2E opt-ins are required.");
  }
  if (!env.E2E_EMAIL || !env.E2E_PASSWORD) {
    throw new Error("Dedicated staging test credentials are required.");
  }
  if (!env.E2E_BASE_URL || !env.E2E_EXPECTED_STAGING_HOST || !env.E2E_PRODUCTION_URL) {
    throw new Error(
      "Dedicated staging URL, expected hostname and production comparison URL required.",
    );
  }
  // A release acceptance run must exercise both security-sensitive staging
  // gates, not silently skip the formula-injection and cross-user checks.
  if (!env.E2E_FIRM_TASK_CSV_CANARY || !/^[\s]*[=+\-@]/u.test(env.E2E_FIRM_TASK_CSV_CANARY)) {
    throw new Error("Seed a formula-prefixed staging CSV canary and set E2E_FIRM_TASK_CSV_CANARY.");
  }
  if (
    !env.E2E_FIRM_RESTRICTED_EMAIL ||
    !env.E2E_FIRM_RESTRICTED_PASSWORD ||
    env.E2E_FIRM_RESTRICTED_EMAIL === env.E2E_EMAIL
  ) {
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
 * of the authoritative StreakBooks repository. A dirty/detached checkout or
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
    blockers.push("Origin must be the authorized StreakBooks GitHub repository.");
  }
  if (!git.remoteRefFresh) {
    blockers.push(
      "Live origin/main verification failed. Fetch the remote successfully before testing.",
    );
  }
  if (!git.commit || !git.originMainCommit || git.commit !== git.originMainCommit) {
    blockers.push("Local HEAD must match fetched origin/main. Pull the latest main first.");
  }
  return { passed: blockers.length === 0, blockers };
}

/**
 * Read Vitest's human summary without assuming that "passed" appears before
 * "failed". Supports plain/ANSI output and the mixed-status "|" layout.
 * No test output or sensitive fixture values are persisted in JSON evidence.
 */
export function extractVitestCounts(output) {
  const plain = String(output).replace(/\u001b\[[0-9;]*m/g, "");
  const lines = plain.split(/\r?\n/);
  function summary(label) {
    const line = [...lines]
      .reverse()
      .find((entry) => new RegExp("^\\s*" + label + "\\s+").test(entry));
    if (!line) {
      return { passed: null, failed: null, skipped: null };
    }
    const counts = { passed: 0, failed: 0, skipped: 0 };
    for (const match of line.matchAll(/\b(\d+)\s+(passed|failed|skipped)\b/g)) {
      counts[match[2]] += Number(match[1]);
    }
    return counts;
  }
  const tests = summary("Tests");
  const files = summary("Test Files");
  return {
    passedTests: tests.passed,
    failedTests: tests.failed,
    skippedTests: tests.skipped,
    passedFiles: files.passed,
    failedFiles: files.failed,
    skippedFiles: files.skipped,
  };
}

/**
 * Parse Playwright's list reporter summary (including ANSI-colored output).
 * Require an explicit 6/6 pass; a process exit of zero is insufficient
 * because a skipped, filtered, or test.only-limited suite can also exit 0.
 */
export function extractPlaywrightCounts(output) {
  const plain = String(output).replace(/\u001b\[[0-9;]*m/g, "");
  const results = { passed: 0, failed: 0, skipped: 0, flaky: 0, interrupted: 0, didNotRun: 0 };
  let found = false;
  for (const line of plain.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(passed|failed|skipped|flaky|interrupted|did not run)\b/);
    if (!match) continue;
    found = true;
    const key = match[2] === "did not run" ? "didNotRun" : match[2];
    results[key] += Number(match[1]);
  }
  return found ? results : null;
}

export function playwrightReleaseGate(output) {
  const counts = extractPlaywrightCounts(output);
  return {
    passed: Boolean(
      counts &&
      counts.passed === FIRM_ONBOARDING_STAGING_TEST_COUNT &&
      counts.failed === 0 &&
      counts.skipped === 0 &&
      counts.flaky === 0 &&
      counts.interrupted === 0 &&
      counts.didNotRun === 0,
    ),
    counts,
  };
}
