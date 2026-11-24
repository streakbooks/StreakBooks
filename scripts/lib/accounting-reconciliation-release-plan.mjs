/** Offline Accounting reconciliation release decisions.
 * No GitHub Actions/CI, database writes or deployment actions.
 */
export const REVIEW_MIGRATIONS = Object.freeze([
  {
    path: "supabase/migrations/20261106233000_reconciliation_review_cases.sql",
    required: [
      "create table public.reconciliation_review_cases",
      "create table public.reconciliation_review_events",
      "create function public.save_reconciliation_review_case",
      "alter table public.reconciliation_review_cases enable row level security",
    ],
  },
  {
    path: "supabase/migrations/20261106234500_reconciliation_review_signoff.sql",
    required: [
      "create function public.progress_reconciliation_review_case",
      "create trigger reconciliation_review_stage_guard",
      "alter table public.reconciliation_review_cases",
    ],
  },
]);

export const RECONCILIATION_TEST_FILES = Object.freeze([
  "src/lib/accounting/reconciliation-exceptions.test.ts",
  "src/lib/accounting/fixed-asset-posting-evidence.test.ts",
  "src/lib/accounting/fixed-asset-posting-evidence.functions.test.ts",
  "src/lib/accounting/fixed-asset-audit-targets.functions.test.ts",
  "src/lib/accounting/fixed-asset-exception-integration.test.ts",
  "src/lib/accounting/reconciliation-review.test.ts",
  "src/lib/accounting/reconciliation-review.functions.test.ts",
  "src/lib/accounting/reconciliation-review-signoff.functions.test.ts",
  "src/lib/accounting/ledger-health.test.ts",
  "src/lib/accounting/ledger-health.functions.test.ts",
  "src/lib/accounting/fx-ledger-audit.test.ts",
  "src/lib/accounting/fx-ledger-audit.functions.test.ts",
  "src/lib/accounting/fx-revaluation-ledger-audit.test.ts",
  "src/lib/accounting/fx-revaluation-ledger-audit.functions.test.ts",
  "src/lib/accounting/deferral-ledger-audit.test.ts",
  "src/lib/accounting/deferral-ledger-audit.functions.test.ts",
  "src/lib/accounting/payroll-accrual-gl-audit.test.ts",
  "src/lib/accounting/payroll-accrual-gl-audit.functions.test.ts",
  "src/lib/accounting/payroll-payment-gl-audit.test.ts",
  "src/lib/accounting/payroll-payment-gl-audit.functions.test.ts",
  "src/lib/accounting/payroll-liability-rollforward.test.ts",
  "src/lib/accounting/payroll-liability-rollforward.functions.test.ts",
]);

export function accountingReleaseSteps({ install = true } = {}) {
  const steps = [];
  if (install) steps.push({ id: "install", args: ["ci"] });
  steps.push(
    { id: "typecheck", args: ["run", "typecheck"] },
    { id: "lint", args: ["run", "lint"] },
    { id: "focused", args: ["test", "--", ...RECONCILIATION_TEST_FILES] },
    { id: "full_unit", args: ["run", "test"] },
    { id: "build", args: ["run", "build"] },
    { id: "bundle", args: ["run", "check:bundle"] },
  );
  return steps;
}

/** A green exit status without an observed Vitest summary must never pass. */
export function parseVitestSummary(output) {
  const text = String(output).replace(/\u001b\[[0-9;]*m/g, "");
  const lines = text.split(/\r?\n/);
  const parse = (label) => {
    const line = [...lines].reverse().find((x) => new RegExp("^\\s*" + label + "\\s+").test(x));
    if (!line) return null;
    const counts = { passed: 0, failed: 0, skipped: 0 };
    for (const match of line.matchAll(/\b(\d+)\s+(passed|failed|skipped)\b/g)) {
      counts[match[2]] += Number(match[1]);
    }
    return counts;
  };
  return { files: parse("Test Files"), tests: parse("Tests") };
}
export function verifyVitestStep({ exitCode, output, expectedFiles = null }) {
  const counts = parseVitestSummary(output);
  const good =
    exitCode === 0 &&
    counts.files !== null &&
    counts.tests !== null &&
    counts.files.failed === 0 &&
    counts.files.skipped === 0 &&
    counts.tests.failed === 0 &&
    counts.tests.skipped === 0 &&
    counts.files.passed > 0 &&
    counts.tests.passed > 0 &&
    (expectedFiles === null || counts.files.passed === expectedFiles);
  return { passed: Boolean(good), counts };
}

export function migrationSourceCheck(sources) {
  const errors = [];
  const files = [];
  for (const m of REVIEW_MIGRATIONS) {
    const content = sources[m.path];
    if (typeof content !== "string" || !content.trim()) {
      errors.push("Missing migration source: " + m.path);
      continue;
    }
    const absent = m.required.filter((piece) => !content.toLowerCase().includes(piece));
    if (absent.length) errors.push("Migration missing required contracts: " + m.path);
    files.push(m.path);
  }
  return { passed: errors.length === 0, files, errors };
}

/** Verify the exact git state; never infer latest main from a stale local ref. */
export function accountingReleasePreflight(git, migrations, testFilesPresent) {
  const blockers = [];
  if (!git || !git.workingTreeStatusKnown || !git.workingTreeClean) {
    blockers.push("Local worktree not verified clean.");
  }
  if (git?.branch !== "main") blockers.push("Local checkout must be main.");
  if (!git?.originMatchesRepo) blockers.push("Origin must be the authorised StreakBooks repository.");
  if (!git?.remoteRefFresh) blockers.push("Cannot verify current origin/main by live fetch.");
  if (!git?.commit || !git?.originMainCommit || git.commit !== git.originMainCommit) {
    blockers.push("Local HEAD differs from fetched origin/main.");
  }
  if (!migrations?.passed) blockers.push("Required review migration source contracts missing.");
  if (!testFilesPresent) blockers.push("One or more required Accounting test suites are missing.");
  return { passed: blockers.length === 0, blockers };
}

export function accountingReleaseDecision({ preflight, postflight, steps, plan, dryRun = false }) {
  const missing = plan.filter((step) => !steps.some((x) => x.id === step.id));
  const allLocalChecksPassed =
    !dryRun &&
    preflight?.passed === true &&
    postflight?.passed === true &&
    missing.length === 0 &&
    steps.length === plan.length &&
    steps.every((x) => x.status === "passed");
  // Migration presence / process exits cannot prove actual RLS or deployment.
  // Intentionally do not accept a user-editable "staging passed" boolean here.
  const blockers = [];
  if (!allLocalChecksPassed) blockers.push("Complete clean-main local checks have not passed.");
  blockers.push("Batch 4 and 5 migrations must be applied and role-tested in dedicated staging.");
  blockers.push("Authenticated browser/E2E and independent reviewer safeguards are not verified.");
  blockers.push("Vercel staging/production deployment and accounting acceptance are not verified.");
  return {
    localChecksPassed: allLocalChecksPassed,
    productionReady: false,
    releaseVerdict: "BLOCKED",
    blockers,
  };
}
