import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (input: unknown) => unknown = (input) => input;
    const chain = {
      middleware() {
        return chain;
      },
      inputValidator(fn: (input: unknown) => unknown) {
        validate = fn;
        return chain;
      },
      handler(fn: (args: { data: unknown; context: unknown }) => Promise<unknown>) {
        return (args: { data: unknown; context: unknown }) =>
          fn({ ...args, data: validate(args.data) });
      },
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/assert-company-access", () => ({ assertCompanyPermission: vi.fn() }));

import { assertCompanyPermission } from "@/lib/assert-company-access";
import { auditPayrollAccrualGl } from "./payroll-accrual-gl-audit.functions";

const company = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const journalId = "33333333-3333-4333-8333-333333333333";
const employeeId = "44444444-4444-4444-8444-444444444444";
const run = {
  id: runId,
  company_id: company,
  run_number: "PR-1",
  status: "posted",
  currency: "GBP",
  payment_date: "2026-11-06",
  net_minor: "800",
  accrual_journal_id: journalId,
  posting_idempotency_key: "payroll-run:" + runId + ":accrual",
};
const journal = {
  id: journalId,
  company_id: company,
  status: "posted",
  source_type: "payroll",
  source_id: runId,
  idempotency_key: "payroll-run:" + runId + ":accrual",
  currency_code: "GBP",
  journal_date: "2026-11-06",
  reversed_by_journal_id: null,
};
const setup = {
  company_id: company,
  salary_expense_account_id: "acc1",
  deduction_liability_account_id: "acc2",
  employer_expense_account_id: "acc4",
  employer_liability_account_id: "acc5",
  net_pay_liability_account_id: "acc3",
};
const initial: Record<string, unknown[]> = {
  payroll_runs: [run],
  journals: [journal],
  payroll_settings: [setup],
  payroll_run_employees: [
    { id: employeeId, company_id: company, run_id: runId, status: "included" },
  ],
  payroll_run_lines: [
    {
      id: "rl1",
      company_id: company,
      run_employee_id: employeeId,
      component_type_id: null,
      kind: "earning",
      amount_minor: "1000",
    },
    {
      id: "rl2",
      company_id: company,
      run_employee_id: employeeId,
      component_type_id: null,
      kind: "deduction",
      amount_minor: "200",
    },
  ],
  payroll_component_types: [],
  journal_lines: [
    {
      id: "jl1",
      company_id: company,
      journal_id: journalId,
      line_no: 1,
      account_id: "acc1",
      debit_minor: "1000",
      credit_minor: "0",
    },
    {
      id: "jl2",
      company_id: company,
      journal_id: journalId,
      line_no: 2,
      account_id: "acc2",
      debit_minor: "0",
      credit_minor: "200",
    },
    {
      id: "jl3",
      company_id: company,
      journal_id: journalId,
      line_no: 3,
      account_id: "acc3",
      debit_minor: "0",
      credit_minor: "800",
    },
  ],
  accounts: [
    { id: "acc1", company_id: company, code: "5000", name: "Wages" },
    { id: "acc2", company_id: company, code: "2200", name: "Payroll deductions" },
    { id: "acc3", company_id: company, code: "2100", name: "Net pay liability" },
  ],
};
let tables: Record<string, unknown[]>;
const filter = vi.fn();
const from = vi.fn((name: string) => {
  const q = {
    select() {
      return q;
    },
    eq(field: string, value: unknown) {
      filter(name, field, value);
      return q;
    },
    in() {
      return q;
    },
    order() {
      return q;
    },
    async limit() {
      return { data: tables[name] ?? [], error: null };
    },
    async maybeSingle() {
      return { data: tables[name]?.[0] ?? null, error: null };
    },
  };
  return q;
});
const call = (c = company, run = runId, journal = journalId) =>
  (auditPayrollAccrualGl as unknown as (args: unknown) => Promise<unknown>)({
    data: { companyId: c, runId: run, journalId: journal },
    context: { supabase: { from } },
  });
beforeEach(() => {
  vi.resetAllMocks();
  tables = Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, [...v]]));
});

describe("payroll accrual GL source audit service", () => {
  it("requires both payroll.view and accounting.view before reading source/GL data", async () => {
    await expect(call()).resolves.toMatchObject({ status: "matched", postedCreditMinor: "1000" });
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      expect.anything(),
      company,
      "payroll.view",
    );
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      expect.anything(),
      company,
      "accounting.view",
    );
    for (const name of [
      "payroll_runs",
      "journals",
      "payroll_settings",
      "payroll_run_employees",
      "payroll_run_lines",
      "journal_lines",
      "accounts",
    ]) {
      expect(filter).toHaveBeenCalledWith(name, "company_id", company);
    }
  });
  it("rejects payroll-view denial before any journal or pay data is read", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied"));
    await expect(call()).rejects.toThrow("Denied");
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects accounting-view denial before any journal or pay data is read", async () => {
    vi.mocked(assertCompanyPermission).mockResolvedValueOnce(undefined);
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied"));
    await expect(call()).rejects.toThrow("Denied");
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects malformed IDs before all data access", () => {
    expect(() => call("invalid")).toThrow();
    expect(() => call(company, "invalid")).toThrow();
    expect(() => call(company, runId, "invalid")).toThrow();
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects a foreign run returned by a buggy query adapter", async () => {
    tables["payroll_runs"] = [{ ...run, company_id: "other" }];
    await expect(call()).rejects.toThrow(/identity/);
  });
  it("prevents other payroll journals from being mistaken for this run's accrual", async () => {
    tables["payroll_runs"] = [{ ...run, accrual_journal_id: "other" }];
    await expect(call()).rejects.toThrow(/does not match/);
  });
  it("fails closed if a payroll source lookup reached the employee bound", async () => {
    tables["payroll_run_employees"] = Array.from({ length: 201 }, (_, i) => ({
      id: "employee-" + i,
      company_id: company,
      run_id: runId,
      status: "included",
    }));
    await expect(call()).rejects.toThrow(/200-row/);
  });
  it("fails closed on 1001 component source lines", async () => {
    tables["payroll_run_lines"] = Array.from({ length: 1001 }, (_, i) => ({
      id: "src-" + i,
      company_id: company,
      run_employee_id: employeeId,
      component_type_id: null,
      kind: "earning",
      amount_minor: "1",
    }));
    await expect(call()).rejects.toThrow(/1000-row/);
  });
  it("fails closed on 501 posted GL lines", async () => {
    tables["journal_lines"] = Array.from({ length: 501 }, (_, i) => ({
      id: "gl-" + i,
      company_id: company,
      journal_id: journalId,
      line_no: i + 1,
      account_id: "acc1",
      debit_minor: "1",
      credit_minor: "0",
    }));
    await expect(call()).rejects.toThrow(/500-line/);
  });
  it("shows missing account evidence as an exception, never a passed status", async () => {
    tables["accounts"] = [initial["accounts"]![0]!];
    await expect(call()).resolves.toMatchObject({ status: "exceptions" });
  });
  it("reports GL account code and name alongside the exact minor unit values", async () => {
    const result = (await call()) as {
      accounts: Array<{ accountCode?: string; accountName?: string }>;
    };
    expect(
      result.accounts.some((row) => row.accountCode === "5000" && row.accountName === "Wages"),
    ).toBe(true);
  });
});
