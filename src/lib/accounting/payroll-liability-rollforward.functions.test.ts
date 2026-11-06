import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (input: unknown) => unknown = (input) => input;
    const chain = {
      middleware() { return chain; },
      inputValidator(fn: (input: unknown) => unknown) { validate = fn; return chain; },
      handler(fn: (args: { data: unknown; context: unknown }) => Promise<unknown>) {
        return (args: { data: unknown; context: unknown }) => fn({
          ...args, data: validate(args.data),
        });
      },
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/assert-company-access", () => ({ assertCompanyPermission: vi.fn() }));
vi.mock("./ledger-data", () => ({
  loadCompanyMeta: vi.fn(),
  loadPostedLines: vi.fn(),
}));

import { assertCompanyPermission } from "@/lib/assert-company-access";
import { loadCompanyMeta, loadPostedLines } from "./ledger-data";
import { getPayrollLiabilityRollforward } from "./payroll-liability-rollforward.functions";

const company = "11111111-1111-4111-8111-111111111111";
const from = "2026-11-01", to = "2026-11-30";
const tables: Record<string, unknown[]> = {};
const base: Record<string, unknown[]> = {
  payroll_settings: [{
    company_id: company, net_pay_liability_account_id: "net",
  }],
  accounts: [{
    id: "net", company_id: company, code: "2100", name: "Wages payable", account_type: "liability",
  }],
  payroll_runs: [{
    id: "run1", company_id: company, status: "paid", payment_date: "2026-11-06",
    currency: "GBP", net_minor: "1000", accrual_journal_id: "j1",
  }],
  payroll_payments: [{
    id: "payment1", company_id: company, status: "posted", payment_date: "2026-11-09",
    currency: "GBP", amount_minor: "800", unallocated_minor: "0", journal_id: "j2",
  }],
};
const readFilters = vi.fn();
const fromTable = vi.fn((name: string) => {
  const q = {
    select() { return q; },
    eq(k: string, val: unknown) { readFilters(name, k, val); return q; },
    in() { return q; },
    gte() { return q; },
    lte() { return q; },
    order() { return q; },
    async maybeSingle() { return { data: tables[name]?.[0] ?? null, error: null }; },
    async limit() { return { data: tables[name] ?? [], error: null }; },
  };
  return q;
});
const call = (c = company, f = from, t = to) =>
  (getPayrollLiabilityRollforward as unknown as (args: unknown) => Promise<unknown>)({
    data: { companyId: c, from: f, to: t },
    context: { supabase: { from: fromTable } },
  });

beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(tables, Object.fromEntries(Object.entries(base).map(([k,v]) => [k,[...v]])));
  vi.mocked(loadCompanyMeta).mockResolvedValue({
    id: company, name: "Demo", baseCurrency: "GBP", countryCode: "GB",
    fyEndMonth: 12, fyEndDay: 31, isDemo: true, locale: "en-GB",
  });
  vi.mocked(loadPostedLines).mockResolvedValue([
    {
      line_id: "l0", account_id: "net", journal_id: "j0",
      journal_date: "2026-10-01", source_type: "manual", source_id: null,
      debit_minor: 0, credit_minor: 500, currency_code: "GBP",
      account_code: "2100", account_name: "Wages payable", account_type: "liability",
    },
    {
      line_id: "l1", account_id: "net", journal_id: "j1",
      journal_date: "2026-11-06", source_type: "payroll", source_id: "run1",
      debit_minor: 0, credit_minor: 1000, currency_code: "GBP",
      account_code: "2100", account_name: "Wages payable", account_type: "liability",
    },
    {
      line_id: "l2", account_id: "net", journal_id: "j2",
      journal_date: "2026-11-09", source_type: "payroll", source_id: "payment1",
      debit_minor: 800, credit_minor: 0, currency_code: "GBP",
      account_code: "2100", account_name: "Wages payable", account_type: "liability",
    },
  ]);
});
describe("period Payroll liability roll-forward server security", () => {
  it("checks Payroll and Accounting view permissions before returning a period result", async () => {
    await expect(call()).resolves.toMatchObject({
      status: "matched", openingCreditMinor: "500", closingCreditMinor: "700",
    });
    expect(assertCompanyPermission).toHaveBeenCalledWith(expect.anything(), company, "accounting.view");
    expect(assertCompanyPermission).toHaveBeenCalledWith(expect.anything(), company, "payroll.view");
    for (const table of Object.keys(base)) {
      expect(readFilters).toHaveBeenCalledWith(table, "company_id", company);
    }
    expect(loadPostedLines).toHaveBeenCalledWith(expect.anything(), company, "GBP", {
      accountIds: ["net"], to,
    });
  });
  it("fails before database access when either view permission is missing", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied"));
    await expect(call()).rejects.toThrow("Denied");
    expect(fromTable).not.toHaveBeenCalled();
    vi.mocked(assertCompanyPermission).mockResolvedValueOnce(undefined);
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied Payroll"));
    await expect(call()).rejects.toThrow("Denied Payroll");
    expect(fromTable).not.toHaveBeenCalled();
  });
  it("rejects invalid dates, reverse ranges and overlong periods", () => {
    expect(() => call(company, "2026-02-30", to)).toThrow();
    expect(() => call(company, to, from)).toThrow();
    expect(() => call(company, "2025-01-01", to)).toThrow();
    expect(() => call("not-a-uuid")).toThrow();
    expect(fromTable).not.toHaveBeenCalled();
  });
  it("rejects missing or cross-company account settings and non-liability account", async () => {
    tables["payroll_settings"] = [];
    await expect(call()).rejects.toThrow(/Configure a Payroll/);
    tables["payroll_settings"] = [{ ...(base["payroll_settings"]![0] as object), company_id: "other" }];
    await expect(call()).rejects.toThrow(/Configure a Payroll/);
    tables["payroll_settings"] = [...base["payroll_settings"]!];
    tables["accounts"] = [{ ...(base["accounts"]![0] as object), account_type: "expense" }];
    await expect(call()).rejects.toThrow(/no longer a liability/);
  });
  it("fails closed if a source row limit is reached", async () => {
    tables["payroll_runs"] = Array.from({ length: 501 }, (_, i) => ({
      ...(base["payroll_runs"]![0] as object),
      id: "run" + i,
    }));
    await expect(call()).rejects.toThrow(/exceeds 500 records/);
    tables["payroll_runs"] = [...base["payroll_runs"]!];
    tables["payroll_payments"] = Array.from({ length: 501 }, (_, i) => ({
      ...(base["payroll_payments"]![0] as object),
      id: "pay" + i,
    }));
    await expect(call()).rejects.toThrow(/exceeds 500 records/);
  });
});
