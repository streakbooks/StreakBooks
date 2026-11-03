import { describe, expect, it } from "vitest";
import {
  REQUIRED_LEDGER_HEALTH_CHECKS,
  checkHref,
  headline,
  overallStatus,
  parseHealthReport,
  problemLabel,
} from "./ledger-health";

const check = (key: string, status: string, over: Record<string, unknown> = {}) => ({
  key,
  label: key,
  status,
  count: status === "pass" || status === "na" ? 0 : 1,
  summary: "s",
  items: [],
  ...over,
});
const allChecks = (statuses: Record<string, string> = {}) =>
  REQUIRED_LEDGER_HEALTH_CHECKS.map((key) => check(key, statuses[key] ?? "pass"));
const raw = (checks: Array<Record<string, unknown>> = allChecks()) => ({
  company_id: "c1",
  base_currency: "GBP",
  generated_at: "2026-11-04T10:00:00Z",
  overall: "pass", // caller-supplied status is untrusted; recomputed from checks
  journals_checked: 12,
  lines_checked: 24,
  checks,
});

describe("overallStatus", () => {
  it("worst status wins, NA is neutral and missing evidence fails closed", () => {
    expect(overallStatus([{ status: "pass" }, { status: "na" }])).toBe("pass");
    expect(overallStatus([{ status: "pass" }, { status: "warn" }])).toBe("warn");
    expect(overallStatus([{ status: "warn" }, { status: "fail" }])).toBe("fail");
    expect(overallStatus([])).toBe("fail");
  });
});

describe("parseHealthReport", () => {
  it("recomputes the overall result regardless of the database overall field", () => {
    const r = parseHealthReport(raw(allChecks({ unbalanced: "fail" })), "c1");
    expect(r.overall).toBe("fail");
    expect(r.journalsChecked).toBe(12);
    expect(r.linesChecked).toBe(24);
    expect(r.baseCurrency).toBe("GBP");
  });
  it("accepts a complete, clean result even with zero posted journals", () => {
    const r = parseHealthReport({ ...raw(), journals_checked: 0, lines_checked: 0 }, "c1");
    expect(r.overall).toBe("pass");
    expect(r.checks).toHaveLength(8);
  });
  it("never accepts zero or missing checks as a clean ledger", () => {
    expect(() => parseHealthReport(raw([]))).toThrow(/no checks/i);
    expect(() => parseHealthReport({ ...raw(), checks: null })).toThrow(/no checks/i);
    expect(() => parseHealthReport({ ...raw(), checks: undefined })).toThrow(/no checks/i);
    expect(() => parseHealthReport(raw(allChecks().slice(1)))).toThrow(/incomplete/i);
  });
  it("rejects duplicate checks even if every required key appears", () => {
    expect(() => parseHealthReport(raw([...allChecks(), check("unbalanced", "pass")]))).toThrow(
      /duplicate/i,
    );
  });
  it("rejects a different company ID even when every check passes", () => {
    expect(() => parseHealthReport(raw(), "other-tenant")).toThrow(/wrong organisation/i);
  });
  it("converts unknown statuses and invalid NA statuses to failures", () => {
    const a = parseHealthReport(raw(allChecks({ orphans: "unknown" })));
    expect(a.checks.find((c) => c.key === "orphans")?.status).toBe("fail");
    const b = parseHealthReport(raw(allChecks({ period_locks: "na" })));
    expect(b.checks.find((c) => c.key === "period_locks")?.status).toBe("fail");
    expect(b.overall).toBe("fail");
  });
  it("allows NA only for subledgers where controls are not configured", () => {
    const result = parseHealthReport(
      raw(allChecks({ subledger_ar: "na", subledger_ap: "na" })),
    );
    expect(result.overall).toBe("pass");
  });
  it("rejects unsafe, missing or negative accounting counts", () => {
    expect(() => parseHealthReport({ ...raw(), lines_checked: -1 })).toThrow(/line count/);
    expect(() => parseHealthReport({ ...raw(), journals_checked: "12" })).toThrow(/journal count/);
    const checks = allChecks();
    checks[0] = check("trial_balance", "pass", { count: -1 });
    expect(() => parseHealthReport(raw(checks))).toThrow(/trial_balance count/);
  });
  it("keeps valid issue details but removes malformed entries", () => {
    const checks = allChecks();
    checks[2] = check("orphans", "fail", {
      items: [{ x: 1 }, null, "text", ["not-a-row"], { y: "z" }],
    });
    const r = parseHealthReport(raw(checks));
    expect(r.checks.find((c) => c.key === "orphans")?.items).toEqual([{ x: 1 }, { y: "z" }]);
  });
  it("rejects an empty or unusable top-level result", () => {
    expect(() => parseHealthReport(null)).toThrow(/no result/i);
    expect(() => parseHealthReport([])).toThrow(/no result/i);
    expect(() => parseHealthReport({ ...raw(), company_id: "" })).toThrow(/wrong organisation/i);
  });
});

describe("headline", () => {
  it("correctly summarizes clean and failing reports", () => {
    const pass = parseHealthReport(raw(allChecks({ subledger_ap: "na" })));
    expect(headline(pass)).toBe("All 7 checks passed.");
    const bad = parseHealthReport(raw(allChecks({ orphans: "fail", automation: "warn" })));
    expect(headline(bad)).toBe("1 failed, 1 need a look of 8 checks.");
  });
});

describe("labels and links", () => {
  it("words known problems and falls back for unknown ones", () => {
    expect(problemLabel("no_journal")).toBe("Issued but has no journal");
    expect(problemLabel("some_new_problem")).toBe("some new problem");
    expect(problemLabel(null)).toBe("Problem");
  });
  it("points subledger checks at the aged reports", () => {
    expect(checkHref("subledger_ar")).toBe("/reports/aged-receivables");
    expect(checkHref("subledger_ap")).toBe("/reports/aged-payables");
    expect(checkHref("nope")).toBeNull();
  });
});
