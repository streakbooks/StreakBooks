import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ledgerMonitorSummary } from "./ledger-integrity";

describe("ledger integrity", () => {
  it("uses the company-member health check and ignores demo status", () => {
    const sql = readFileSync(
      new URL(
        "../../../supabase/migrations/20261025130000_ledger_health_check.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(sql).toContain("public.is_company_member(_company)");
    expect(sql).toContain("public.has_company_permission(_company, 'accounting.view')");
    expect(sql).toContain("No is_demo logic");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.ledger_health_check(JSONB) FROM PUBLIC, anon",
    );
    expect(sql).not.toContain("platform_can");
  });

  it("summarises status only", () => {
    expect(() =>
      ledgerMonitorSummary({ membership: false, canViewAccounting: true, checks: null }),
    ).toThrow(/access/);
    expect(
      ledgerMonitorSummary({ membership: true, canViewAccounting: true, checks: null }),
    ).toEqual({
      status: "unchecked",
    });
    const summary = ledgerMonitorSummary({
      membership: true,
      canViewAccounting: true,
      checks: [{ status: "pass" }, { status: "fail" }],
    });
    expect(summary).toEqual({ status: "fail" });
    expect(summary).not.toHaveProperty("differenceMinor");
  });
});
