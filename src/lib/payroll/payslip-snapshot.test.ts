import { describe, expect, it } from "vitest";
import {
  buildPayslipSnapshot,
  payslipDeductions,
  payslipEarnings,
  payslipEmployerLines,
} from "@/lib/payroll/payslip-snapshot";

describe("buildPayslipSnapshot", () => {
  it("sorts lines by sort_order then code", () => {
    const snapshot = buildPayslipSnapshot({
      employee: {
        id: "e1",
        employeeNumber: "EMP-0001",
        displayName: "Jane Doe",
        department: null,
        designation: null,
      },
      period: { start: "2026-01-01", end: "2026-01-31", paymentDate: "2026-02-05" },
      run: { id: "r1", runNumber: "PR-0001" },
      totals: {
        grossEarningsMinor: 500_000,
        employeeDeductionsMinor: 50_000,
        netPayMinor: 450_000,
        employerContributionsMinor: 25_000,
        totalEmployerCostMinor: 525_000,
      },
      lines: [
        {
          kind: "earning",
          code: "BONUS",
          name: "Bonus",
          amountMinor: 100_000,
          isEmployer: false,
          sortOrder: 200,
        },
        {
          kind: "earning",
          code: "BASIC",
          name: "Basic",
          amountMinor: 400_000,
          isEmployer: false,
          sortOrder: 100,
        },
        {
          kind: "deduction",
          code: "PENSION",
          name: "Pension",
          amountMinor: 50_000,
          isEmployer: false,
          sortOrder: 100,
        },
      ],
      branding: {
        companyName: "Acme Ltd",
        brandingName: "Acme Payroll",
        footerNote: null,
        showEmployerCosts: true,
        currency: "GBP",
      },
    });

    expect(snapshot.version).toBe(1);
    expect(snapshot.lines.map((l) => l.code)).toEqual(["BASIC", "PENSION", "BONUS"]);
    expect(payslipEarnings(snapshot)).toHaveLength(2);
    expect(payslipDeductions(snapshot)).toHaveLength(1);
    expect(payslipEmployerLines(snapshot)).toHaveLength(0);
  });
});
