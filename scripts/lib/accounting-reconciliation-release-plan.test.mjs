import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  REVIEW_MIGRATIONS,
  RECONCILIATION_TEST_FILES,
  accountingReleaseSteps,
  parseVitestSummary,
  verifyVitestStep,
  migrationSourceCheck,
  accountingReleasePreflight,
  accountingReleaseDecision,
} from "./accounting-reconciliation-release-plan.mjs";

const trusted = {
  branch: "main",
  commit: "a".repeat(40),
  originMainCommit: "a".repeat(40),
  originMatchesRepo: true,
  remoteRefFresh: true,
  workingTreeClean: true,
  workingTreeStatusKnown: true,
};
const sources = Object.fromEntries(
  REVIEW_MIGRATIONS.map((x) => [x.path, x.required.join(";\n") + ";"]),
);
const passed = { passed: true, blockers: [] };

describe("Accounting release plan without GitHub CI", () => {
  it("requires locked dependency install, typecheck, lint, focused and full tests, build and bundle", () => {
    const plan = accountingReleaseSteps();
    assert.deepEqual(
      plan.map((x) => x.id),
      ["install", "typecheck", "lint", "focused", "full_unit", "build", "bundle"],
    );
    assert.equal(plan.find((x) => x.id === "focused").args[2], RECONCILIATION_TEST_FILES[0]);
    assert.equal(
      plan.find((x) => x.id === "focused").args.length,
      RECONCILIATION_TEST_FILES.length + 2,
    );
    assert.equal(plan.find((x) => x.id === "full_unit").args.join(" "), "run test");
    assert.doesNotMatch(
      plan.flatMap((x) => x.args).join(" "),
      /\bgh\s+(run|workflow)|workflow_dispatch|github actions/i,
    );
  });
  it("can skip npm ci only, never unit checks, typecheck or build", () => {
    const plan = accountingReleaseSteps({ install: false });
    assert.equal(plan.length, 6);
    assert.equal(
      plan.some((x) => x.id === "install"),
      false,
    );
    assert.equal(
      plan.some((x) => x.id === "focused"),
      true,
    );
    assert.equal(
      plan.some((x) => x.id === "build"),
      true,
    );
  });
  it("tracks both migrations in strict version order without inventing deployment", () => {
    assert.equal(REVIEW_MIGRATIONS.length, 2);
    assert.ok(REVIEW_MIGRATIONS[0].path < REVIEW_MIGRATIONS[1].path);
    assert.ok(REVIEW_MIGRATIONS[0].path.includes("20261106233000"));
    assert.ok(REVIEW_MIGRATIONS[1].path.includes("20261106234500"));
  });
  it("detects missing review schema or unsafe incomplete contract", () => {
    assert.deepEqual(migrationSourceCheck(sources).passed, true);
    assert.equal(migrationSourceCheck({}).passed, false);
    assert.equal(
      migrationSourceCheck({
        ...sources,
        [REVIEW_MIGRATIONS[1].path]: "select 1;",
      }).passed,
      false,
    );
  });
  it("contains the required cross-module, fixed assets, server and review suites", () => {
    assert.equal(RECONCILIATION_TEST_FILES.length, 22);
    assert.equal(new Set(RECONCILIATION_TEST_FILES).size, RECONCILIATION_TEST_FILES.length);
    for (const file of RECONCILIATION_TEST_FILES) {
      assert.match(file, /^src\/lib\/accounting\/[^/]+\.test\.ts$/);
    }
    assert.ok(RECONCILIATION_TEST_FILES.some((x) => x.includes("reconciliation-review-signoff")));
    assert.ok(RECONCILIATION_TEST_FILES.some((x) => x.includes("fixed-asset")));
    assert.ok(RECONCILIATION_TEST_FILES.some((x) => x.includes("payroll-liability")));
  });
});

describe("Accounting release evidence parser is fail closed", () => {
  it("accepts exactly all required focused suites when every suite passes", () => {
    const sample = " Test Files  22 passed (22)\n      Tests  126 passed (126)\n";
    const result = verifyVitestStep({
      exitCode: 0,
      output: sample,
      expectedFiles: RECONCILIATION_TEST_FILES.length,
    });
    assert.equal(result.passed, true);
    assert.deepEqual(result.counts.files, { passed: 22, failed: 0, skipped: 0 });
    assert.deepEqual(result.counts.tests, { passed: 126, failed: 0, skipped: 0 });
  });
  it("does not accept an omitted, filtered or test.only-limited suite", () => {
    const result = verifyVitestStep({
      exitCode: 0,
      output: " Test Files  21 passed (21)\n Tests  125 passed (125)",
      expectedFiles: RECONCILIATION_TEST_FILES.length,
    });
    assert.equal(result.passed, false);
  });
  it("does not count a green exit as passing without Vitest summary evidence", () => {
    assert.equal(verifyVitestStep({ exitCode: 0, output: "no tests run" }).passed, false);
    assert.equal(parseVitestSummary("nothing").files, null);
    assert.equal(parseVitestSummary("nothing").tests, null);
  });
  it("rejects failures and skips regardless of summary order", () => {
    const output =
      " Test Files  1 failed | 21 passed (22)\n" +
      "      Tests  1 skipped | 3 failed | 120 passed (124)\n";
    const result = verifyVitestStep({ exitCode: 0, output, expectedFiles: 22 });
    assert.equal(result.passed, false);
    assert.equal(result.counts.files.failed, 1);
    assert.equal(result.counts.tests.skipped, 1);
    assert.equal(result.counts.tests.failed, 3);
  });
  it("recognises ANSI-coloured summary with zero failed or skipped tests", () => {
    const sample = "\u001b[32m Test Files 22 passed (22)\u001b[0m\n" + "Tests 123 passed (123)";
    assert.equal(verifyVitestStep({ exitCode: 0, output: sample, expectedFiles: 22 }).passed, true);
  });
  it("rejects an otherwise green test summary if process failed", () => {
    const sample = " Test Files  22 passed (22)\n Tests 123 passed (123)";
    assert.equal(
      verifyVitestStep({ exitCode: 1, output: sample, expectedFiles: 22 }).passed,
      false,
    );
  });
});

describe("Accounting release gate resists stale refs and fabricated production status", () => {
  it("accepts a clean updated exact main checkout with migration sources and test files", () => {
    assert.deepEqual(accountingReleasePreflight(trusted, { passed: true }, true), {
      passed: true,
      blockers: [],
    });
  });
  it("rejects dirty main, failed fetch, wrong origin and detached branch", () => {
    for (const changes of [
      { workingTreeClean: false },
      { workingTreeStatusKnown: false },
      { remoteRefFresh: false },
      { originMatchesRepo: false },
      { branch: "" },
      { branch: "feat/reconciliation" },
      { originMainCommit: "b".repeat(40) },
      { commit: null },
    ]) {
      assert.equal(
        accountingReleasePreflight({ ...trusted, ...changes }, { passed: true }, true).passed,
        false,
      );
    }
  });
  it("rejects absent SQL migration and test fixtures", () => {
    assert.equal(accountingReleasePreflight(trusted, { passed: false }, true).passed, false);
    assert.equal(accountingReleasePreflight(trusted, { passed: true }, false).passed, false);
  });
  it("recognises locally passing code checks but still blocks production approval", () => {
    const plan = accountingReleaseSteps({ install: false });
    const result = accountingReleaseDecision({
      preflight: passed,
      postflight: passed,
      plan,
      steps: plan.map((x) => ({ id: x.id, status: "passed" })),
    });
    assert.equal(result.localChecksPassed, true);
    assert.equal(result.productionReady, false);
    assert.equal(result.releaseVerdict, "BLOCKED");
    assert.match(result.blockers.join(" "), /staging/);
  });
  it("never treats a dry run or missing test result as verified", () => {
    const plan = accountingReleaseSteps({ install: false });
    const stages = plan.map((x) => ({ id: x.id, status: "passed" }));
    assert.equal(
      accountingReleaseDecision({
        preflight: passed,
        postflight: passed,
        plan,
        steps: stages,
        dryRun: true,
      }).localChecksPassed,
      false,
    );
    assert.equal(
      accountingReleaseDecision({
        preflight: passed,
        postflight: passed,
        plan,
        steps: stages.slice(1),
      }).localChecksPassed,
      false,
    );
    assert.equal(
      accountingReleaseDecision({
        preflight: passed,
        postflight: { passed: false },
        plan,
        steps: stages,
      }).localChecksPassed,
      false,
    );
  });
});
