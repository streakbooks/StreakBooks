import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (input: unknown): unknown => input;
    const chain = {
      middleware: () => chain,
      validator: (fn: typeof validate) => {
        validate = fn;
        return chain;
      },
      handler:
        (fn: (args: { data: unknown; context: unknown }) => Promise<unknown>) =>
        async (args: { data: unknown; context: unknown }) =>
          fn({ ...args, data: validate(args.data) }),
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/assert-company-access", () => ({ assertCompanyPermission: vi.fn() }));
vi.mock("./cash-report.server", () => ({ loadCashReportLines: vi.fn() }));
vi.mock("./cash-profit-loss.server", () => ({ loadCashProfitLossInput: vi.fn() }));
vi.mock("@/lib/planning/rpc", async (actual) => ({
  ...(await actual<typeof import("@/lib/planning/rpc")>()),
  callRpc: vi.fn(),
}));
vi.mock("@/lib/accounting/ledger-data", async (actual) => ({
  ...(await actual<typeof import("@/lib/accounting/ledger-data")>()),
  loadCompanyMeta: vi.fn(),
  loadAccountMetas: vi.fn(),
  fetchLedgerBalances: vi.fn(),
}));

import {
  getProfitAndLoss,
  getBalanceSheet,
  getTrialBalance,
  getGeneralLedgerAll,
  getAccountTransactions,
} from "./report.functions";
import { getManagementMetrics } from "./ecosystem.functions";
import { loadCashReportLines } from "./cash-report.server";
import { loadCashProfitLossInput } from "./cash-profit-loss.server";
import { cashInputFixture } from "./__fixtures__/cash-facts";
import { reportingFactsFixture, revenueId, testCompany } from "./__fixtures__/facts";
import { cashLedger } from "./cash-ledger";
import { cashEntriesToPostedLines } from "./cash-report";
import {
  loadCompanyMeta,
  loadAccountMetas,
  fetchLedgerBalances,
} from "@/lib/accounting/ledger-data";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc } from "@/lib/planning/rpc";

let companyBasis: "cash" | "accrual";
const range = { companyId: testCompany, from: "2026-11-01", to: "2026-11-30" };
const supabase = {
  from(table: string) {
    let ids: string[] = [];
    const query = {
      select: () => query,
      eq: () => query,
      in: (_column: string, values: string[]) => {
        ids = values;
        return query;
      },
      maybeSingle: async () =>
        table === "organisation_config"
          ? { data: { document: { reporting_basis: companyBasis } }, error: null }
          : {
              data: {
                ...cashInputFixture().accounts.find((account) => account.id === revenueId),
                normal_balance: "credit",
              },
              error: null,
            },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve({
          data: ids.map((id) => ({
            id,
            currency_code: "GBP",
            fx_rate_to_base: "1",
            posted_at: null,
            posted_by: null,
            created_by: null,
          })),
          error: null,
        }).then(resolve);
      },
    };
    return query;
  },
};
const execute = <T>(fn: unknown, data: unknown) =>
  (fn as (args: unknown) => Promise<T>)({ data, context: { supabase } });
beforeEach(() => {
  vi.resetAllMocks();
  companyBasis = "cash";
  const input = cashInputFixture();
  vi.mocked(loadCompanyMeta).mockResolvedValue({
    id: testCompany,
    name: "Company",
    baseCurrency: "GBP",
    countryCode: "GB",
    fyEndMonth: 12,
    fyEndDay: 31,
    isDemo: false,
    locale: null,
  });
  vi.mocked(loadAccountMetas).mockResolvedValue(input.accounts);
  vi.mocked(loadCashProfitLossInput).mockResolvedValue(input);
  vi.mocked(loadCashReportLines).mockImplementation(async (_sb, _id, from, to) =>
    cashEntriesToPostedLines(input, cashLedger(input, { from, to })),
  );
  vi.mocked(fetchLedgerBalances).mockResolvedValue(
    reportingFactsFixture().period.map((row) => ({
      ...row,
      debit_minor: BigInt(row.debit_minor),
      credit_minor: BigInt(row.credit_minor),
    })),
  );
  vi.mocked(callRpc).mockImplementation(async (_sb, _fn, args) => ({
    ...reportingFactsFixture(),
    accounts: input.accounts,
    from: args["_from"],
    to: args["_to"],
  }));
});
describe("cash reporting APIs and accrual regression", () => {
  it("uses the company cash setting for legacy P&L, with explicit accrual retaining existing balances", async () => {
    const cash = await execute<{
      income: number;
      expense: number;
      net: number;
      accountingBasis: string;
    }>(getProfitAndLoss, range);
    expect(cash).toMatchObject({
      income: 5000,
      expense: 4000,
      net: 1000,
      accountingBasis: "cash",
    });
    expect(fetchLedgerBalances).not.toHaveBeenCalled();
    const accrual = await execute<{
      income: number;
      expense: number;
      net: number;
      accountingBasis: string;
    }>(getProfitAndLoss, { ...range, basis: "accrual" });
    expect(accrual).toMatchObject({
      income: 15000,
      expense: 4000,
      net: 11000,
      accountingBasis: "accrual",
    });
    expect(fetchLedgerBalances).toHaveBeenCalled();
  });
  it("balances cash Trial Balance and Balance Sheet from the same recognized ledger", async () => {
    const tb = await execute<{ totalDebit: number; totalCredit: number; accountingBasis: string }>(
      getTrialBalance,
      range,
    );
    expect(tb.totalDebit).toBe(tb.totalCredit);
    expect(tb.accountingBasis).toBe("cash");
    const bs = await execute<{
      assets: number;
      liabilities: number;
      equity: number;
      equationHolds: boolean;
    }>(getBalanceSheet, { companyId: testCompany, asOf: range.to, basis: "cash" });
    expect(bs.equationHolds).toBe(true);
    expect(bs.assets).toBe(bs.liabilities + bs.equity);
  });
  it("cash GL and account transactions drill to the allocated amount on the receipt date", async () => {
    const gl = await execute<{
      accounts: Array<{
        account: { id: string };
        rows: Array<{ journal_date: string; credit_minor: number }>;
      }>;
    }>(getGeneralLedgerAll, { ...range, basis: "cash" });
    const revenue = gl.accounts.find((account) => account.account.id === revenueId)!;
    expect(revenue.rows.map((row) => [row.journal_date, row.credit_minor])).toEqual([
      ["2026-11-02", 5000],
    ]);
    const account = await execute<{
      rows: Array<{ journal_date: string; credit_minor: number }>;
      closing_balance_minor: number;
    }>(getAccountTransactions, { ...range, accountId: revenueId, basis: "cash" });
    expect(account.rows.map((row) => [row.journal_date, row.credit_minor])).toEqual([
      ["2026-11-02", 5000],
    ]);
    expect(account.closing_balance_minor).toBe(5000);
  });
  it("management metrics follow the selected cash basis and keep explicit accrual totals", async () => {
    const cash = await execute<{
      accountingBasis: string;
      metrics: { revenue: { value: string }; net_profit: { value: string } };
    }>(getManagementMetrics, range);
    expect(cash.accountingBasis).toBe("cash");
    expect(cash.metrics.revenue.value).toBe("5000");
    expect(cash.metrics.net_profit.value).toBe("1000");
    const accrual = await execute<typeof cash>(getManagementMetrics, {
      ...range,
      basis: "accrual",
    });
    expect(accrual.accountingBasis).toBe("accrual");
    expect(accrual.metrics.net_profit.value).toBe("11000");
  });
  it("denies financial access before loading cash sources and rejects invalid basis", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValue(new Error("Denied"));
    await expect(execute(getTrialBalance, range)).rejects.toThrow("Denied");
    expect(loadCashReportLines).not.toHaveBeenCalled();
    await expect(execute(getTrialBalance, { ...range, basis: "unknown" })).rejects.toThrow(
      "Choose cash or accrual",
    );
  });
});
