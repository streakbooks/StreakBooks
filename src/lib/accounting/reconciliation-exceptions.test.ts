import { describe, expect, it } from "vitest";
import {
  createExceptionSnapshot, filterExceptionFindings, exceptionSnapshotCsv,
  type ExceptionInputs,
} from "./reconciliation-exceptions";
import type { HealthReport } from "./ledger-health";
import type { FxRealisedAuditResult } from "./fx-ledger-audit";
import type { DeferralAuditResult } from "./deferral-ledger-audit";
import type { FxRunAuditReport } from "./fx-revaluation-ledger-audit";
import type { LiabilityRollforwardResult } from "./payroll-liability-rollforward";

const unrun: ExceptionInputs = {
  ledger: { state: "not_run" },
  realisedFx: { state: "not_run" },
  revaluation: { state: "not_run" },
  deferrals: { state: "not_run" },
  payroll: { state: "not_run" },
};
const health: HealthReport = {
  companyId: "company",
  baseCurrency: "GBP", generatedAt: "2026-11-06T07:00:00Z",
  overall: "fail", journalsChecked: 12, linesChecked: 24,
  checks: [
    { key: "trial_balance", label: "Trial balance", status: "fail", count: 3,
      summary: "Trial balance differs", items: [
        { account: "=CMD('danger')", difference_minor: "100" },
      ] },
    { key: "orphans", label: "Orphan lines", status: "warn", count: 1,
      summary: "Review one orphan", items: [{ journal_id: "j1" }] },
    { key: "unbalanced", label: "Journal balance", status: "pass", count: 0,
      summary: "OK", items: [] },
  ],
};
const fx: FxRealisedAuditResult = {
  rowsChecked: 3, limit: 50, hasMore: true, exceptions: 2,
  rows: [
    { recordId: "fx1", journalId: "j2", currencyCode: "USD",
      gainLossMinor: "30", status: "mismatch", issues: ["FX journal not posted"] },
    { recordId: "fx2", journalId: "j3", currencyCode: "EUR",
      gainLossMinor: "-25", status: "reversed", issues: [] },
    { recordId: "fx3", journalId: "j4", currencyCode: "CAD",
      gainLossMinor: "12", status: "matched", issues: [] },
  ],
};
const deferral: DeferralAuditResult = {
  scheduleId: "schedule-1", scheduleName: "Insurance", totalMinor: "1200",
  allocatedMinor: "1200", differenceMinor: "0",
  scheduleIssues: ["Schedule totals require review"],
  exceptionCount: 3,
  entries: [
    { entryId: "d1", periodNo: 1, journalId: "j5", status: "mismatch",
      issues: ["Linked journal mismatch"] },
    { entryId: "d2", periodNo: 2, journalId: null, status: "unposted", issues: [] },
    { entryId: "d3", periodNo: 3, journalId: "j6", status: "matched", issues: [] },
  ],
};
const reval: FxRunAuditReport = {
  runId: "rv1", asOfDate: "2026-10-31", reverseOn: "2026-11-01",
  journalCount: 3, expectedGainMinor: "100", actualGainMinor: "99",
  expectedLossMinor: "0", actualLossMinor: "0", reversedCount: 1,
  exceptionCount: 2, differences: ["Gain difference"],
  items: [
    { journalId: "j7", currencyCode: "AUD", status: "exception",
      reversalStatus: "failed", gainMinor: "99", lossMinor: "0",
      issues: ["Journal not posted"] },
    { journalId: "j8", currencyCode: "USD", status: "reversed",
      reversalStatus: "done", gainMinor: "0", lossMinor: "0", issues: [] },
  ],
};
const payroll = {
  status: "exceptions", currency: "GBP", accountId: "acc1",
  accountCode: "2100", accountName: "Net pay", start: "2026-11-01",
  end: "2026-11-30", lineCount: 10, sourceRunCount: 2, paymentCount: 2,
  openingCreditMinor: "1000", accrualCreditMinor: "500",
  paymentDebitMinor: "450", reversalNetCreditMinor: "0",
  otherNetCreditMinor: "0", closingCreditMinor: "1050",
  reconstructedClosingCreditMinor: "1050", expectedRunAccrualCreditMinor: "510",
  expectedPaymentDebitMinor: "450", accrualVarianceMinor: "-10",
  paymentVarianceMinor: "0",
  issues: [{ kind: "amount_mismatch" as const,
    sourceId: "run1", journalId: "j9", message: "Payroll accrual discrepancy" }],
  warnings: ["Unallocated payment is present"],
} satisfies LiabilityRollforwardResult;

describe("reconciliation centre evidence boundaries", () => {
  it("never returns a global clean bill of health when no audits have run", () => {
    const result = createExceptionSnapshot(unrun);
    expect(result.findings).toHaveLength(0);
    expect(result.fullyVerified).toBe(false);
    expect(result.coverage).toHaveLength(6);
    expect(result.coverage.every(x => x.state === "not_run")).toBe(true);
  });
  it("shows missing or failed audit as unavailable rather than passed", () => {
    const result = createExceptionSnapshot({
      ...unrun, ledger: { state: "checked" },
      realisedFx: { state: "unavailable", message: "Access denied" },
    });
    expect(result.coverage.find(x => x.source === "ledger")?.state).toBe("unavailable");
    expect(result.coverage.find(x => x.source === "fx_realised")?.note).toContain("Access denied");
    expect(result.fullyVerified).toBe(false);
  });
  it("normalises ledger checks with exact sample-versus-total disclosure", () => {
    const result = createExceptionSnapshot({
      ...unrun, ledger: { state: "checked", result: health },
    });
    expect(result.errors).toBe(1);
    expect(result.warnings).toBe(1);
    const trial = result.findings.find(x => x.title === "Trial balance");
    expect(trial?.findingCount).toBe(3);
    expect(trial?.detail).toMatch(/Additional findings/);
    expect(result.findings.some(x => x.title === "Journal balance")).toBe(false);
  });
  it("normalises partially sampled realised FX without treating reversals as clean", () => {
    const result = createExceptionSnapshot({
      ...unrun, realisedFx: { state: "checked", result: fx },
    });
    expect(result.coverage.find(x => x.source === "fx_realised")?.state).toBe("partial");
    expect(result.errors).toBe(1);
    expect(result.warnings).toBe(1);
    expect(result.findings.find(x => x.reference === "fx2")?.severity).toBe("warning");
  });
  it("normalises per-schedule and per-run checks but keeps coverage partial", () => {
    const result = createExceptionSnapshot({
      ...unrun, deferrals: { state: "checked", result: deferral },
      revaluation: { state: "checked", result: reval },
    });
    expect(result.errors).toBe(4);
    expect(result.warnings).toBe(1);
    expect(result.coverage.find(x => x.source === "deferrals")?.state).toBe("partial");
    expect(result.coverage.find(x => x.source === "fx_revaluation")?.state).toBe("partial");
    expect(result.findings.some(x => x.journalId === "j7")).toBe(true);
  });
  it("normalises Payroll source issues and warnings while identifying the journal", () => {
    const result = createExceptionSnapshot({
      ...unrun, payroll: { state: "checked", result: payroll },
    });
    expect(result.errors).toBe(1);
    expect(result.warnings).toBe(1);
    expect(result.findings.find(x => x.severity === "error")?.journalId).toBe("j9");
    expect(result.coverage.find(x => x.source === "payroll")?.state).toBe("partial");
  });
  it("keeps Fixed Assets explicitly unchecked when the other audits returned clean results", () => {
    const clean: HealthReport = { ...health, checks: health.checks.map(c => ({
      ...c, status: "pass" as const, count: 0, items: [],
    })) };
    const result = createExceptionSnapshot({
      ...unrun, ledger: { state: "checked", result: clean },
    });
    expect(result.errors).toBe(0);
    expect(result.fullyVerified).toBe(false);
    expect(result.coverage.find(x => x.source === "fixed_assets")?.state).toBe("not_run");
  });
  it("filters by source, severity, review status and case-insensitive text", () => {
    const result = createExceptionSnapshot({
      ...unrun, ledger: { state: "checked", result: health },
      realisedFx: { state: "checked", result: fx },
    });
    const firstKey = result.findings.find(x => x.source === "ledger" && x.severity === "error")!.key;
    const reviewed = new Set([firstKey]);
    const selected = filterExceptionFindings(result.findings, {
      source: "ledger", severity: "error", search: "trial", review: "reviewed",
    }, reviewed);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.key).toBe(firstKey);
    const unreviewed = filterExceptionFindings(result.findings, {
      source: "all", severity: "all", search: "", review: "unreviewed",
    }, reviewed);
    expect(unreviewed).toHaveLength(result.findings.length - 1);
  });
  it("exports all coverage rows and neutralises spreadsheet formula injections", () => {
    const formula = { ...health, checks: [
      { ...health.checks[0]!, summary: "=CMD('danger')" },
    ] };
    const result = createExceptionSnapshot({
      ...unrun, ledger: { state: "checked", result: formula },
    });
    const csv = exceptionSnapshotCsv(result, new Set());
    expect(csv).toContain("Fixed assets");
    expect(csv).toContain("Coverage");
    expect(csv).toContain("'=CMD('");
    expect(csv).toContain("Not a sign-off");
  });
  it("refuses duplicate unstable exception identities", () => {
    const duplicates: FxRealisedAuditResult = {
      ...fx, rows: [fx.rows[0]!, fx.rows[0]!],
    };
    expect(() => createExceptionSnapshot({
      ...unrun, realisedFx: { state: "checked", result: duplicates },
    })).toThrow(/Duplicate reconciliation exception identity/);
  });
});
