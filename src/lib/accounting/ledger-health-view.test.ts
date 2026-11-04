import { describe, expect, it } from "vitest";
import type { HealthCheck, HealthReport } from "./ledger-health";
import { filteredHealthChecks, healthStatusCounts, ledgerHealthCsv } from "./ledger-health-view";

function check(
  key: string,
  status: HealthCheck["status"],
  extras: Partial<HealthCheck> = {},
): HealthCheck {
  return {
    key,
    label: key,
    status,
    count: status === "pass" ? 0 : 1,
    summary: `Review ${key}`,
    items: [],
    ...extras,
  };
}

const checks = [
  check("trial_balance", "pass"),
  check("orphans", "fail", { items: [{ problem: "line_without_journal", id: "abc" }] }),
  check("automation", "warn", { items: [{ problem: "overdue" }] }),
  check("subledger_ap", "na"),
];

describe("ledger health report presentation", () => {
  it("counts all statuses without changing an overall result", () => {
    expect(healthStatusCounts(checks)).toEqual({ fail: 1, warn: 1, pass: 1, na: 1 });
  });

  it("filters issues, statuses and search text across issue details", () => {
    expect(filteredHealthChecks(checks, "issues", "").map((x) => x.key)).toEqual([
      "orphans",
      "automation",
    ]);
    expect(filteredHealthChecks(checks, "fail", "").map((x) => x.key)).toEqual(["orphans"]);
    expect(filteredHealthChecks(checks, "all", "LINE_without_JOURNAL")).toHaveLength(1);
    expect(filteredHealthChecks(checks, "issues", "no match")).toHaveLength(0);
  });

  it("exports all eight checks and only returned sample rows, not filtered checks", () => {
    const complete = [
      ...checks,
      check("unbalanced", "pass"),
      check("document_journals", "pass"),
      check("subledger_ar", "pass"),
      check("period_locks", "pass"),
    ];
    const report = {
      companyId: "company",
      baseCurrency: "USD",
      generatedAt: "2026-11-04T00:00:00Z",
      overall: "fail",
      journalsChecked: 12,
      linesChecked: 26,
      checks: complete,
    } satisfies HealthReport;
    const csv = ledgerHealthCsv(report);
    expect(csv.split("\r\n")).toHaveLength(12);
    expect(csv).toContain("orphans,orphans,fail,1");
    expect(csv).toContain("line_without_journal");
    expect(csv).toContain("period_locks,period_locks,pass");
  });

  it("escapes dangerous spreadsheet formulas and quoted issue strings", () => {
    const report: HealthReport = {
      companyId: "co",
      baseCurrency: "USD",
      generatedAt: "",
      overall: "fail",
      journalsChecked: 0,
      linesChecked: 0,
      checks: [
        check("orphans", "fail", {
          label: '=HYPERLINK("https://bad.example")',
          items: [{ memo: 'quoted "value", newline\n=1+2' }],
        }),
      ],
    };
    const csv = ledgerHealthCsv(report);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('""value""');
    expect(csv).toContain("newline\n=1+2");
  });
});
