import { describe, expect, it } from "vitest";
import {
  buildPayrollExpenseByDepartmentReport,
  buildPayrollRegisterReport,
  buildPayrollSummaryReport,
  runPayrollReport,
  type PayrollReportEmployeeSlice,
  type PayrollReportFacts,
} from "@/lib/payroll/payroll-reports";
import type {
  PayrollEmployeeRow,
  PayrollRunEmployeeRow,
  PayrollRunLineRow,
  PayrollRunRow,
} from "@/lib/payroll/types";

function run(overrides: Partial<PayrollRunRow> = {}): PayrollRunRow {
  return {
    id: "run-1",
    company_id: "co-1",
    run_number: "PR-001",
    pay_schedule_id: "sched-1",
    period_start: "2026-01-01",
    period_end: "2026-01-31",
    payment_date: "2026-02-05",
    status: "posted",
    currency: "GBP",
    gross_minor: 100_000,
    deductions_minor: 20_000,
    net_minor: 80_000,
    employer_minor: 10_000,
    employer_cost_minor: 110_000,
    net_paid_minor: 0,
    accrual_journal_id: "j-1",
    posted_at: "2026-02-01T00:00:00Z",
    requires_approval: true,
    approved_by: null,
    approved_at: null,
    calculated_at: null,
    reviewed_at: null,
    version: 1,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function employee(overrides: Partial<PayrollEmployeeRow> = {}): PayrollEmployeeRow {
  return {
    id: "emp-1",
    company_id: "co-1",
    contact_id: "contact-1",
    employee_number: "E001",
    first_name: "Alex",
    last_name: "Example",
    email: null,
    status: "active",
    hire_date: "2025-01-01",
    termination_date: null,
    department: "Operations",
    designation: null,
    employment_type: "salaried",
    work_location: null,
    payroll_country_code: "GB",
    payroll_currency: "GBP",
    pay_schedule_id: "sched-1",
    salary_structure_id: null,
    payment_method: "bank_transfer",
    notes: null,
    archived_at: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function runEmployee(overrides: Partial<PayrollRunEmployeeRow> = {}): PayrollRunEmployeeRow {
  return {
    id: "re-1",
    company_id: "co-1",
    run_id: "run-1",
    employee_id: "emp-1",
    status: "included",
    gross_minor: 100_000,
    deductions_minor: 20_000,
    net_minor: 80_000,
    employer_minor: 10_000,
    employer_cost_minor: 110_000,
    hours_leave_snapshot: null,
    ...overrides,
  };
}

function slice(overrides: Partial<PayrollReportEmployeeSlice> = {}): PayrollReportEmployeeSlice {
  return {
    run: run(),
    runEmployee: runEmployee(),
    employee: employee(),
    payslip: null,
    scheduleName: "Monthly",
    ...overrides,
  };
}

function baseFacts(
  slices: PayrollReportEmployeeSlice[],
  lines: PayrollRunLineRow[] = [],
): PayrollReportFacts {
  const linesByRunEmployeeId = new Map<string, PayrollRunLineRow[]>();
  for (const line of lines) {
    const bucket = linesByRunEmployeeId.get(line.run_employee_id) ?? [];
    bucket.push(line);
    linesByRunEmployeeId.set(line.run_employee_id, bucket);
  }
  return {
    currency: "GBP",
    dateFrom: "2026-01-01",
    dateTo: "2026-12-31",
    slices,
    linesByRunEmployeeId,
    journalsByRunId: new Map(),
  };
}

describe("payroll report aggregation", () => {
  it("summarises run totals on payroll summary", () => {
    const facts = baseFacts([slice()]);
    const report = buildPayrollSummaryReport(facts);
    expect(report.rows).toHaveLength(1);
    expect(report.totals?.["grossMinor"]).toBe(100_000);
    expect(report.totals?.["netMinor"]).toBe(80_000);
  });

  it("register rows reconcile to employee run totals", () => {
    const facts = baseFacts([slice()]);
    const report = buildPayrollRegisterReport(facts);
    expect(report.totals?.["grossMinor"]).toBe(100_000);
    expect(report.totals?.["deductionsMinor"]).toBe(20_000);
  });

  it("groups payroll expense by department", () => {
    const facts = baseFacts([
      slice(),
      slice({
        runEmployee: runEmployee({
          id: "re-2",
          employee_id: "emp-2",
          gross_minor: 50_000,
          net_minor: 40_000,
          deductions_minor: 10_000,
          employer_cost_minor: 55_000,
        }),
        employee: employee({ id: "emp-2", employee_number: "E002", department: "Finance" }),
      }),
    ]);
    const report = buildPayrollExpenseByDepartmentReport(facts);
    expect(report.rows).toHaveLength(2);
    expect(report.totals?.["grossMinor"]).toBe(150_000);
  });

  it("aggregates earning lines by employee and code", () => {
    const line: PayrollRunLineRow = {
      id: "line-1",
      company_id: "co-1",
      run_employee_id: "re-1",
      component_type_id: null,
      kind: "earning",
      code: "BASIC",
      name: "Basic salary",
      amount_minor: 100_000,
      quantity_micro: null,
      rate_minor: null,
      percentage_bps: null,
      is_employer: false,
      is_variable: false,
      sort_order: 100,
    };
    const facts = baseFacts([slice()], [line]);
    const report = runPayrollReport("employee_earnings", facts);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]?.["amountMinor"]).toBe(100_000);
  });
});
