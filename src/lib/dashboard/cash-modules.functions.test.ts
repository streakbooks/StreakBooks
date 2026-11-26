import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (input: unknown): unknown => input;
    const chain = {
      middleware: () => chain,
      validator(fn: typeof validate) {
        validate = fn;
        return chain;
      },
      validator(fn: typeof validate) {
        validate = fn;
        return chain;
      },
      handler:
        (fn: (args: { data: unknown; context: unknown }) => Promise<unknown>) =>
        (args: { data: unknown; context: unknown }) =>
          fn({ ...args, data: validate(args.data) }),
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/assert-company-access", () => ({
  assertCompanyMember: vi.fn(),
  assertCompanyPermission: vi.fn(),
}));
vi.mock("@/lib/reports/cash-report.server", () => ({ loadCashReportLines: vi.fn() }));
vi.mock("@/lib/accounting/ledger-data", async (original) => ({
  ...(await original<typeof import("@/lib/accounting/ledger-data")>()),
  loadCompanyMeta: vi.fn(),
  loadAccountMetas: vi.fn(),
  fetchLedgerBalances: vi.fn(),
  fetchAccountBalanceAsOf: vi.fn(),
  loadPostedLines: vi.fn(),
}));
vi.mock("@/lib/planning/rpc", async (original) => ({
  ...(await original<typeof import("@/lib/planning/rpc")>()),
  callRpc: vi.fn(),
}));

import { getDashboardSnapshot } from "./dashboard.functions";
import { getBudgetVsActual, getYearActuals } from "@/lib/budgets/budgets.functions";
import { cashInputFixture } from "@/lib/reports/__fixtures__/cash-facts";
import { testCompany, revenueId, expenseId, bankId } from "@/lib/reports/__fixtures__/facts";
import { cashLedger } from "@/lib/reports/cash-ledger";
import { cashEntriesToPostedLines } from "@/lib/reports/cash-report";
import { loadCashReportLines } from "@/lib/reports/cash-report.server";
import {
  loadCompanyMeta,
  loadAccountMetas,
  fetchLedgerBalances,
  fetchAccountBalanceAsOf,
  loadPostedLines,
  aggregateLines,
} from "@/lib/accounting/ledger-data";
import { callRpc } from "@/lib/planning/rpc";
import { assertCompanyMember } from "@/lib/assert-company-access";

const budgetId = "12345678-1234-4234-8234-123456789012";
let companyDefault: "cash" | "accrual" = "cash";
const sb = {
  rpc: vi.fn(async () => ({ data: true, error: null })),
  from: (table: string) => {
    const rows =
      table === "budgets"
        ? [
            {
              id: budgetId,
              name: "Annual plan",
              fiscal_year_start: "2026-01-01",
              notes: null,
              updated_at: "2026-01-01",
            },
          ]
        : table === "organisation_config"
          ? [{ document: { reporting_basis: companyDefault } }]
          : [];
    const result = { data: rows, error: null, count: 0 };
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      lte: () => chain,
      gte: () => chain,
      limit: () => chain,
      range: () => chain,
      maybeSingle: async () => ({ ...result, data: rows[0] ?? null }),
      then: (done: (value: typeof result) => unknown) => Promise.resolve(result).then(done),
    };
    return chain;
  },
};
const execute = <T>(fn: unknown, data: unknown) =>
  (fn as (args: unknown) => Promise<T>)({ data, context: { supabase: sb } });
const accrualLines = () => {
  const input = cashInputFixture();
  return cashEntriesToPostedLines(
    input,
    input.journals.flatMap((journal) =>
      journal.lines.map((line) => ({
        accountId: line.accountId,
        date: journal.date,
        journalId: journal.id,
        journalNumber: journal.number,
        sourceJournalId: journal.id,
        sourceType: journal.sourceType,
        sourceId: journal.sourceId,
        debit: line.debit,
        credit: line.credit,
        reason: "direct_cash" as const,
      })),
    ),
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  companyDefault = "cash";
  vi.mocked(loadCompanyMeta).mockResolvedValue({
    id: testCompany,
    name: "Test",
    baseCurrency: "GBP",
    countryCode: "GB",
    fyEndMonth: 12,
    fyEndDay: 31,
    isDemo: false,
    locale: "en-GB",
  });
  vi.mocked(loadAccountMetas).mockResolvedValue(
    cashInputFixture().accounts.map((account) => ({
      ...account,
      show_on_dashboard_watchlist: [revenueId, expenseId, bankId].includes(account.id),
    })),
  );
  vi.mocked(fetchAccountBalanceAsOf).mockResolvedValue(1200n);
  vi.mocked(loadPostedLines).mockResolvedValue([]);
  vi.mocked(loadCashReportLines).mockImplementation(async (_sb, _company, from, to) => {
    const input = cashInputFixture();
    return cashEntriesToPostedLines(input, cashLedger(input, { from, to }));
  });
  vi.mocked(fetchLedgerBalances).mockImplementation(async (_sb, _company, _currency, range) =>
    aggregateLines(
      accrualLines().filter(
        (line) =>
          (!range?.from || line.journal_date >= range.from) &&
          (!range?.to || line.journal_date <= range.to),
      ),
    ),
  );
  vi.mocked(callRpc).mockImplementation(async (_sb, name, args) => {
    if (name !== "ledger_monthly_activity") throw new Error(`Unexpected RPC ${name}`);
    const range = args as { _from: string; _to: string };
    return accrualLines()
      .filter((line) => line.journal_date >= range._from && line.journal_date <= range._to)
      .map((line) => ({
        account_id: line.account_id,
        month: `${line.journal_date.slice(0, 7)}-01`,
        debit_minor: Number(line.debit_minor),
        credit_minor: Number(line.credit_minor),
      }));
  });
});

describe("cash basis module integration", () => {
  it("uses allocated cash dates for dashboard profit, comparisons and watchlist", async () => {
    const result = await execute<Awaited<ReturnType<typeof getDashboardSnapshot>>>(
      getDashboardSnapshot,
      { companyId: testCompany, asOf: "2026-11-30" },
    );
    expect(result.accountingBasis).toBe("cash");
    expect(result.profit).toMatchObject({
      thisYearMinor: 1000,
      thisYearRevenueMinor: 5000,
      lastYearMinor: 0,
    });
    expect(result.watchlist.find((account) => account.id === revenueId)?.balanceMinor).toBe(5000);
    expect(result.watchlist.find((account) => account.id === expenseId)?.balanceMinor).toBe(4000);
    expect(result.watchlist.find((account) => account.id === bankId)?.balanceMinor).toBe(1200);
    expect(fetchLedgerBalances).not.toHaveBeenCalled();
    expect(loadCashReportLines).toHaveBeenCalledTimes(1);
  });

  it("excludes unpaid documents from dashboard before their payment month", async () => {
    const result = await execute<Awaited<ReturnType<typeof getDashboardSnapshot>>>(
      getDashboardSnapshot,
      { companyId: testCompany, asOf: "2026-10-31" },
    );
    expect(result.profit.thisYearMinor).toBe(0);
    expect(result.profit.thisYearRevenueMinor).toBe(0);
  });

  it("retains accrual dashboard figures with an explicit override", async () => {
    const result = await execute<Awaited<ReturnType<typeof getDashboardSnapshot>>>(
      getDashboardSnapshot,
      { companyId: testCompany, asOf: "2026-11-30", basis: "accrual" },
    );
    expect(result.profit).toMatchObject({ thisYearMinor: 2000, thisYearRevenueMinor: 10000 });
    expect(loadCashReportLines).not.toHaveBeenCalled();
    expect(fetchLedgerBalances).toHaveBeenCalledTimes(2);
  });

  it("matches cash budget actuals to payment months and preserves YTD totals", async () => {
    const result = await execute<Awaited<ReturnType<typeof getBudgetVsActual>>>(getBudgetVsActual, {
      companyId: testCompany,
      budgetId,
      to: "2026-11-30",
    });
    expect(result.accountingBasis).toBe("cash");
    const revenue = result.report.income.rows.find((row) => row.accountId === revenueId)!;
    const expense = result.report.expense.rows.find((row) => row.accountId === expenseId)!;
    expect(revenue.cells[9]!.actualMinor).toBe(0);
    expect(revenue.cells[10]!.actualMinor).toBe(5000);
    expect(revenue.cells.at(-1)!.actualMinor).toBe(5000);
    expect(expense.cells[10]!.actualMinor).toBe(4000);
    expect(result.report.net.at(-1)!.actualMinor).toBe(1000);
    expect(callRpc).not.toHaveBeenCalled();
  });

  it("keeps accrual budget actuals on source document dates", async () => {
    const result = await execute<Awaited<ReturnType<typeof getBudgetVsActual>>>(getBudgetVsActual, {
      companyId: testCompany,
      budgetId,
      to: "2026-11-30",
      basis: "accrual",
    });
    const revenue = result.report.income.rows.find((row) => row.accountId === revenueId)!;
    expect(result.accountingBasis).toBe("accrual");
    expect(revenue.cells[9]!.actualMinor).toBe(10000);
    expect(revenue.cells[10]!.actualMinor).toBe(0);
    expect(loadCashReportLines).not.toHaveBeenCalled();
  });

  it("copies prior-year actuals using the company basis", async () => {
    const result = await execute<Awaited<ReturnType<typeof getYearActuals>>>(getYearActuals, {
      companyId: testCompany,
      fiscalYearStart: "2026-01-01",
    });
    expect(result.accountingBasis).toBe("cash");
    expect(result.rows.find((row) => row.accountId === revenueId)?.months).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5000, 0,
    ]);
  });

  it("authorizes the company before loading cash financial data", async () => {
    vi.mocked(assertCompanyMember).mockRejectedValueOnce(new Error("Denied"));
    await expect(
      execute(getDashboardSnapshot, { companyId: testCompany, asOf: "2026-11-30" }),
    ).rejects.toThrow("Denied");
    expect(loadCashReportLines).not.toHaveBeenCalled();
  });
});
