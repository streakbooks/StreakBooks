import { describe, expect, it } from "vitest";
import { payrollPayslipsToCsv, payslipNetBalances, PAYSLIP_EXPORT_HEADERS } from "./payslip-list-export";
import type { PayrollPayslipsListPage } from "@/lib/payroll/types";

type ListRow = PayrollPayslipsListPage["payslips"][number];

function sampleRow({
  currency = "USD",
  paidMinor = 5000,
  netMinor = 13550,
  name = "Ada Lee",
}: {
  currency?: string;
  paidMinor?: number;
  netMinor?: number;
  name?: string;
} = {}): ListRow {
  const [firstName, ...last] = name.split(" ");
  return {
    payslip: {
      id: "p1",
      payslip_number: "PAY-0001",
      issued_at: "2026-11-06T10:00:00Z",
      payment_status: paidMinor === 0 ? "unpaid" : paidMinor === netMinor ? "paid" : "partial",
      amount_paid_minor: paidMinor,
      snapshot: {
        totals: {
          grossEarningsMinor: netMinor + 1450,
          employeeDeductionsMinor: 1450,
          netPayMinor: netMinor,
        },
      },
    },
    employee: {
      employee_number: "EMP-0001",
      first_name: firstName,
      last_name: last.join(" "),
    },
    run: {
      run_number: "RUN-01",
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      currency,
    },
  } as ListRow;
}

describe("payroll payslip list CSV export", () => {
  it("shows net, paid and outstanding consistently with partial payments", () => {
    expect(payslipNetBalances(sampleRow().payslip)).toEqual({
      netMinor: 13550,
      paidMinor: 5000,
      outstandingMinor: 8550,
    });
    const csv = payrollPayslipsToCsv([sampleRow()]);
    expect(csv).toContain("USD,150.00,14.50,135.50,50.00,85.50");
  });

  it("does not mix currency amounts or add cross-currency totals", () => {
    const csv = payrollPayslipsToCsv([
      sampleRow({ currency: "USD" }),
      sampleRow({ currency: "JPY", netMinor: 1800, paidMinor: 0 }),
    ]);
    expect(csv).toContain("USD,150.00,14.50,135.50,50.00,85.50");
    expect(csv).toContain("JPY,3250,1450,1800,0,1800");
    expect(csv.trim().split("\r\n")).toHaveLength(3);
  });

  it("neutralises spreadsheet formulas in employee names", () => {
    const csv = payrollPayslipsToCsv([sampleRow({ name: "=HYPERLINK Click" })]);
    expect(csv).toContain("'=HYPERLINK Click");
    expect(csv).not.toContain(",=HYPERLINK Click,");
  });

  it("exports exactly the supplied filtered rows and a header for empty selection", () => {
    const first = sampleRow();
    const selected = sampleRow({ currency: "AUD", name: "Annie Jones" });
    const csv = payrollPayslipsToCsv([selected]);
    expect(csv).toContain("Annie Jones");
    expect(csv).not.toContain("Ada Lee");
    expect(csv).toContain("AUD,150.00");
    const empty = payrollPayslipsToCsv([]);
    expect(empty.trim().split("\r\n")).toHaveLength(1);
    expect(empty).toContain(PAYSLIP_EXPORT_HEADERS[0]);
    expect(first.payslip.payslip_number).toBe("PAY-0001");
  });

  it("never reports a negative outstanding amount for fully paid payslips", () => {
    expect(payslipNetBalances(sampleRow({ paidMinor: 14000 }).payslip).outstandingMinor).toBe(0);
  });
});
