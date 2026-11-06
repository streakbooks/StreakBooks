import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (input: unknown) => unknown = (x) => x;
    const chain = {
      middleware() { return chain; },
      inputValidator(fn: (input: unknown) => unknown) { validate = fn; return chain; },
      handler(fn: (args: { data: unknown; context: unknown }) => Promise<unknown>) {
        return (args: { data: unknown; context: unknown }) => fn({ ...args, data: validate(args.data) });
      },
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/assert-company-access", () => ({ assertCompanyPermission: vi.fn() }));
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { auditPayrollPaymentGl } from "./payroll-payment-gl-audit.functions";
const company = "11111111-1111-4111-8111-111111111111";
const paymentId = "22222222-2222-4222-8222-222222222222";
const journalId = "33333333-3333-4333-8333-333333333333";
const runId = "44444444-4444-4444-8444-444444444444";
const slipId = "55555555-5555-4555-8555-555555555555";
const original = {
  id: journalId, company_id: company, status: "posted", source_type: "payroll",
  source_id: paymentId, idempotency_key: "payroll-payment:" + paymentId + ":post",
  journal_date: "2026-11-06", currency_code: "GBP", reverses_journal_id: null, reversed_by_journal_id: null,
};
const payment = {
  id: paymentId, company_id: company, payment_date: "2026-11-06",
  amount_minor: "1000", unallocated_minor: "0", currency: "GBP",
  clearing_account_id: "cash", journal_id: journalId, status: "posted",
  idempotency_key: null, reversal_journal_id: null,
};
const initial: Record<string, unknown[]> = {
  payroll_payments: [payment],
  journals: [original],
  payroll_payment_allocations: [{
    id: "alloc1", company_id: company, payment_id: paymentId, payslip_id: slipId,
    run_id: runId, run_employee_id: "re1", amount_minor: "1000",
  }],
  payroll_payslips: [{ id: slipId, company_id: company, run_id: runId, run_employee_id: "re1" }],
  payroll_runs: [{ id: runId, company_id: company, status: "paid", accrual_journal_id: "accrual1" }],
  payroll_settings: [{ company_id: company, net_pay_liability_account_id: "net" }],
  journal_lines: [
    { id: "line1", company_id: company, journal_id: journalId, line_no: 1,
      account_id: "net", debit_minor: "1000", credit_minor: "0" },
    { id: "line2", company_id: company, journal_id: journalId, line_no: 2,
      account_id: "cash", debit_minor: "0", credit_minor: "1000" },
  ],
  accounts: [
    { id: "net", company_id: company, code: "2100", name: "Wages payable" },
    { id: "cash", company_id: company, code: "1000", name: "Bank" },
  ],
};
let tables: Record<string, unknown[]>;
const filters = vi.fn();
const from = vi.fn((name: string) => {
  let selectedId: unknown = null;
  const q = {
    select() { return q; },
    eq(field: string, value: unknown) {
      filters(name, field, value);
      if (field === "id") selectedId = value;
      return q;
    },
    in() { return q; },
    order() { return q; },
    async maybeSingle() {
      const values = tables[name] ?? [];
      return { data: selectedId
        ? values.find((v) => (v as {id?: string}).id === selectedId) ?? null
        : values[0] ?? null, error: null };
    },
    async limit() { return { data: tables[name] ?? [], error: null }; },
  };
  return q;
});
const call = (c = company, p = paymentId, j = journalId) =>
  (auditPayrollPaymentGl as unknown as (args: unknown) => Promise<unknown>)({
    data: { companyId: c, paymentId: p, journalId: j },
    context: { supabase: { from } },
  });
beforeEach(() => {
  vi.resetAllMocks();
  tables = Object.fromEntries(Object.entries(initial).map(([k,v]) => [k, [...v]]));
});
describe("Payroll payment GL service access and bounded evidence", () => {
  it("checks both permissions before reading any table and scopes each table to company", async () => {
    await expect(call()).resolves.toMatchObject({ state: "matched", paymentMinor: "1000" });
    expect(assertCompanyPermission).toHaveBeenCalledWith(expect.anything(), company, "payroll.view");
    expect(assertCompanyPermission).toHaveBeenCalledWith(expect.anything(), company, "accounting.view");
    for (const name of Object.keys(initial)) {
      expect(filters).toHaveBeenCalledWith(name, "company_id", company);
    }
  });
  it("does not query when either permission is denied", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied"));
    await expect(call()).rejects.toThrow("Denied");
    expect(from).not.toHaveBeenCalled();
    vi.mocked(assertCompanyPermission).mockResolvedValueOnce(undefined);
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied again"));
    await expect(call()).rejects.toThrow("Denied again");
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects malformed IDs before data access", () => {
    expect(() => call("invalid")).toThrow();
    expect(() => call(company, "invalid")).toThrow();
    expect(() => call(company, paymentId, "invalid")).toThrow();
    expect(from).not.toHaveBeenCalled();
  });
  it("does not allow another payment or tenant to be substituted for the selected journal", async () => {
    tables["payroll_payments"] = [{ ...payment, journal_id: "other" }];
    await expect(call()).rejects.toThrow(/does not match/);
    tables["payroll_payments"] = [{ ...payment, company_id: "other" }];
    await expect(call()).rejects.toThrow(/does not match/);
  });
  it("rejects over-bound allocation and journal evidence rather than returning a partial pass", async () => {
    tables["payroll_payment_allocations"] = Array.from({ length: 101 }, (_, i) => ({
      ...(initial["payroll_payment_allocations"]![0] as object),
      id: "alloc-" + i,
    }));
    await expect(call()).rejects.toThrow(/100 allocations/);
    tables["payroll_payment_allocations"] = [...initial["payroll_payment_allocations"]!];
    tables["journal_lines"] = Array.from({ length: 11 }, (_, i) => ({
      ...(initial["journal_lines"]![0] as object),
      id: "line-" + i, line_no: i + 1,
    }));
    await expect(call()).rejects.toThrow(/GL exceeds ten lines/);
  });
  it("treats missing payslip and account evidence as an exception", async () => {
    tables["payroll_payslips"] = [];
    await expect(call()).resolves.toMatchObject({ state: "exceptions" });
    tables["payroll_payslips"] = [...initial["payroll_payslips"]!];
    tables["accounts"] = [initial["accounts"]![0]!];
    await expect(call()).resolves.toMatchObject({ state: "exceptions" });
  });
  it("checks the reversal with a separate company-filtered journal read", async () => {
    const reversalId = "66666666-6666-4666-8666-666666666666";
    const reversal = { ...original, id: reversalId, source_type: "reversal",
      source_id: journalId, idempotency_key: "payroll-payment:" + paymentId + ":reverse",
      reverses_journal_id: journalId, reversed_by_journal_id: null };
    tables["payroll_payments"] = [{ ...payment, status: "reversed", reversal_journal_id: reversalId }];
    tables["journals"] = [{ ...original, reversed_by_journal_id: reversalId }, reversal];
    tables["journal_lines"] = [
      ...initial["journal_lines"]!,
      { ...(initial["journal_lines"]![0] as object), id: "rev1", journal_id: reversalId,
        debit_minor: "0", credit_minor: "1000" },
      { ...(initial["journal_lines"]![1] as object), id: "rev2", journal_id: reversalId,
        debit_minor: "1000", credit_minor: "0" },
    ];
    await expect(call()).resolves.toMatchObject({ state: "reversed" });
    expect(filters.mock.calls.filter(args => args[0] === "journals" && args[1] === "company_id")).toHaveLength(2);
  });
});
