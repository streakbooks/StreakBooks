import { parseAccountingBasis, type AccountingBasis } from "./accounting-basis";
import { resolveReportingBasis } from "./accounting-basis.server";
import { loadCashReportLines } from "./cash-report.server";
import { assertCurrentPayablesDate, payableOutstandingInBase } from "./payables-integrity";
import { shouldIncludeLedgerAccount } from "./account-scope";
import { parseReportAccountIds } from "./report-account-selection";
import {
  filterTransactionRows,
  type TransactionFlow,
  type TransactionSort,
} from "./account-transaction-options";
import { toMinorUnits, decimalPlacesFor } from "@/lib/accounting/money";
import { loadCompanyDefaults } from "@/lib/sales/sales-common";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { billOutstanding } from "@/lib/purchases/line-math";
import { invoiceOutstanding } from "@/lib/sales/line-helpers";
import { fetchAllPages, type PageResult } from "@/lib/accounting/fetch-all";
import { addDaysIso, fiscalYearStart, shiftYear, todayIso } from "@/lib/accounting/fiscal-year";
import {
  buildAgingReport,
  buildBalanceSheet,
  buildCashFlowFromBank,
  buildFiscalTrialBalance,
  buildProfitAndLoss,
  buildTaxSummary,
  buildTrialBalance,
  type AgingDoc,
  type PostedLine,
} from "@/lib/accounting/reporting";
import {
  accountMap,
  balancesToLines,
  fetchAccountBalanceAsOf,
  fetchAccountTransactionsPage,
  fetchLedgerBalances,
  type AccountTxnPage,
  loadAccountMetas,
  loadCompanyMeta,
  loadPostedLines,
  type AccountMeta,
  type CompanyMeta,
  type Sb,
} from "@/lib/accounting/ledger-data";
import { findControlAccountIds, resolveTaxAccountIds } from "@/lib/accounting/control-accounts";
import { loadTaxFacts } from "@/lib/tax/tax-return-data";
import { computeReturnTotals, summariseByTreatment } from "@/lib/tax/vat-return";
import {
  buildBalanceSheetStatement,
  buildPnlStatement,
  monthColumns,
  priorPeriodRange,
  priorYearRange,
  quarterColumns,
  type ColumnMode,
  type StatementLine,
} from "@/lib/reports/statements";

import { assertReportDate as isoDate } from "./date-validation";

function optIsoDate(v: unknown, name: string): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  return isoDate(v, name);
}

function companyId(input: { companyId: string }): string {
  return assertUuid(input?.companyId);
}

const COLUMN_MODES: ColumnMode[] = ["none", "prior_period", "prior_year", "month", "quarter"];

function columnMode(v: unknown): ColumnMode {
  return COLUMN_MODES.includes(v as ColumnMode) ? (v as ColumnMode) : "none";
}

export type Ctx = {
  supabase: Sb;
  meta: CompanyMeta;
  accounts: AccountMeta[];
  byId: Map<string, AccountMeta>;
  accountingBasis: AccountingBasis;
};

export async function loadCtx(supabase: Sb, id: string, basis?: AccountingBasis): Promise<Ctx> {
  await assertCompanyPermission(supabase, id, "reports.view");
  const [meta, accounts] = await Promise.all([
    loadCompanyMeta(supabase, id),
    loadAccountMetas(supabase, id),
  ]);
  return {
    supabase,
    meta,
    accounts,
    byId: accountMap(accounts),
    accountingBasis: await resolveReportingBasis(supabase, id, basis),
  };
}

function num(v: bigint): number {
  return Number(v);
}

/* ------------------------------------------------------------------ */
/* Shared builders                                                     */
/* ------------------------------------------------------------------ */

export async function plFor(ctx: Ctx, from: string, to: string) {
  if (ctx.accountingBasis === "cash")
    return buildProfitAndLoss(await loadCashReportLines(ctx.supabase, ctx.meta.id, from, to), {
      from,
      to,
    });
  const bal = await fetchLedgerBalances(ctx.supabase, ctx.meta.id, ctx.meta.baseCurrency, {
    from,
    to,
    excludeYearEndClose: true,
  });
  const lines = balancesToLines(bal, ctx.byId, to, ctx.meta.baseCurrency).filter(
    (l) => l.account_type === "income" || l.account_type === "expense",
  );
  return buildProfitAndLoss(lines, { from, to });
}

export async function bsFor(ctx: Ctx, asOf: string) {
  const fyStart = fiscalYearStart(asOf, ctx.meta.fyEndMonth, ctx.meta.fyEndDay);
  const priorEnd = addDaysIso(fyStart, -1);
  if (ctx.accountingBasis === "cash")
    return buildBalanceSheet(
      await loadCashReportLines(ctx.supabase, ctx.meta.id, "0001-01-01", asOf),
      { asOf, fyStart },
    );
  const [prior, current] = await Promise.all([
    fetchLedgerBalances(ctx.supabase, ctx.meta.id, ctx.meta.baseCurrency, { to: priorEnd }),
    fetchLedgerBalances(ctx.supabase, ctx.meta.id, ctx.meta.baseCurrency, {
      from: fyStart,
      to: asOf,
    }),
  ]);
  const lines = [
    ...balancesToLines(prior, ctx.byId, priorEnd, ctx.meta.baseCurrency),
    ...balancesToLines(current, ctx.byId, asOf, ctx.meta.baseCurrency),
  ];
  return buildBalanceSheet(lines, { asOf, fyStart });
}

function serialiseStatement(lines: StatementLine[]) {
  return lines.map((l) => ({ ...l, amounts: l.amounts.map(num) }));
}

/* ------------------------------------------------------------------ */
/* Trial balance                                                       */
/* ------------------------------------------------------------------ */

export const getTrialBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      from?: string;
      to?: string;
      basis?: AccountingBasis | undefined;
    }) => ({
      companyId: companyId(input),
      basis: parseAccountingBasis(input.basis),
      from: optIsoDate(input.from, "From"),
      to: optIsoDate(input.to, "To"),
    }),
  )
  .handler(async ({ data, context }) => {
    const ctx = await loadCtx(
      context.supabase,
      data.companyId,
      "basis" in data ? parseAccountingBasis(data.basis) : undefined,
    );
    const to = data.to ?? todayIso();
    const base = ctx.meta.baseCurrency;
    let result: ReturnType<typeof buildTrialBalance> & { priorYearsEarningsMinor?: bigint };
    let fyStart: string | null = null;
    let basis: string;
    if (ctx.accountingBasis === "cash") {
      const lines = await loadCashReportLines(
        ctx.supabase,
        ctx.meta.id,
        data.from ?? "0001-01-01",
        to,
      );
      if (data.from) {
        result = buildTrialBalance(lines);
        basis = `Cash basis; activity ${data.from} to ${to}`;
      } else {
        fyStart = fiscalYearStart(to, ctx.meta.fyEndMonth, ctx.meta.fyEndDay);
        result = buildFiscalTrialBalance(lines, { to, fyStart });
        basis = `Cash basis; as at ${to}; income and expenses from ${fyStart}`;
      }
    } else if (data.from) {
      const bal = await fetchLedgerBalances(ctx.supabase, ctx.meta.id, base, {
        from: data.from,
        to,
      });
      result = buildTrialBalance(balancesToLines(bal, ctx.byId, to, base));
      basis = `Activity ${data.from} to ${to}`;
    } else {
      fyStart = fiscalYearStart(to, ctx.meta.fyEndMonth, ctx.meta.fyEndDay);
      const priorEnd = addDaysIso(fyStart, -1);
      const [prior, current] = await Promise.all([
        fetchLedgerBalances(ctx.supabase, ctx.meta.id, base, { to: priorEnd }),
        fetchLedgerBalances(ctx.supabase, ctx.meta.id, base, { from: fyStart, to }),
      ]);
      const lines = [
        ...balancesToLines(prior, ctx.byId, priorEnd, base),
        ...balancesToLines(current, ctx.byId, to, base),
      ];
      result = buildFiscalTrialBalance(lines, { to, fyStart });
      basis = `As at ${to}; income and expenses are financial-year-to-date from ${fyStart}`;
    }
    return {
      fyStart,
      basis,
      accountingBasis: ctx.accountingBasis,
      priorYearsEarningsMinor: num(result.priorYearsEarningsMinor ?? 0n),
      rows: result.rows.map((r) => ({
        ...r,
        debit_minor: num(r.debit_minor),
        credit_minor: num(r.credit_minor),
      })),
      totalDebit: num(result.totalDebit),
      totalCredit: num(result.totalCredit),
      balances: result.balances,
    };
  });

/* ------------------------------------------------------------------ */
/* Profit & loss (sectioned, comparatives, months / quarters)          */
/* ------------------------------------------------------------------ */

type DateColumn = { label: string; from: string; to: string };

export function plColumns(mode: ColumnMode, from: string, to: string): DateColumn[] {
  const main: DateColumn = { label: "Selected period", from, to };
  if (mode === "prior_period") {
    const p = priorPeriodRange(from, to);
    return [main, { label: "Prior period", ...p }];
  }
  if (mode === "prior_year") {
    const p = priorYearRange(from, to);
    return [main, { label: "Prior year", ...p }];
  }
  if (mode === "month") return [...monthColumns(from, to), { ...main, label: "Total" }];
  if (mode === "quarter") return [...quarterColumns(from, to), { ...main, label: "Total" }];
  return [main];
}

export const getProfitAndLoss = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      from: string;
      to: string;
      columns?: ColumnMode;
      basis?: AccountingBasis | undefined;
    }) => ({
      companyId: companyId(input),
      from: isoDate(input.from, "From"),
      to: isoDate(input.to, "To"),
      columns: columnMode(input.columns),
      basis: parseAccountingBasis(input.basis),
    }),
  )
  .handler(async ({ data, context }) => {
    if (data.to < data.from) throw new Error("'To' date cannot be before 'From' date.");
    const ctx = await loadCtx(
      context.supabase,
      data.companyId,
      "basis" in data ? parseAccountingBasis(data.basis) : undefined,
    );
    const columns = plColumns(data.columns, data.from, data.to);
    const results = await Promise.all(columns.map((c) => plFor(ctx, c.from, c.to)));
    const main =
      results[data.columns === "month" || data.columns === "quarter" ? results.length - 1 : 0]!;
    return {
      basis:
        ctx.accountingBasis === "cash"
          ? "Cash basis, allocated receipts, payments and direct cash movements"
          : "Accrual basis, posted ledger (year-end closing journals excluded)",
      accountingBasis: ctx.accountingBasis,
      columns,
      statement: serialiseStatement(buildPnlStatement(results)),
      income: num(main.income),
      expense: num(main.expense),
      net: num(main.net),
      revenue: num(main.revenue),
      contraRevenue: num(main.contraRevenue),
      costOfSales: num(main.costOfSales),
      grossProfit: num(main.grossProfit),
      operatingExpense: num(main.operatingExpense),
      otherNet: num(main.otherNet),
    };
  });

/* ------------------------------------------------------------------ */
/* Balance sheet                                                       */
/* ------------------------------------------------------------------ */

export const getBalanceSheet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      asOf: string;
      basis?: AccountingBasis | undefined;
      compare?: "none" | "prior_year" | "prior_month" | "months";
    }) => ({
      companyId: companyId(input),
      asOf: isoDate(input.asOf, "As at"),
      basis: parseAccountingBasis(input.basis),
      compare: (["none", "prior_year", "prior_month", "months"] as const).includes(
        input.compare as never,
      )
        ? (input.compare as "none" | "prior_year" | "prior_month" | "months")
        : "none",
    }),
  )
  .handler(async ({ data, context }) => {
    const ctx = await loadCtx(
      context.supabase,
      data.companyId,
      "basis" in data ? parseAccountingBasis(data.basis) : undefined,
    );
    const dates: Array<{ label: string; asOf: string }> = [{ label: data.asOf, asOf: data.asOf }];
    if (data.compare === "prior_year") {
      const d = shiftYear(data.asOf, -1);
      dates.push({ label: d, asOf: d });
    } else if (data.compare === "prior_month") {
      const d = addDaysIso(`${data.asOf.slice(0, 7)}-01`, -1);
      dates.push({ label: d, asOf: d });
    } else if (data.compare === "months") {
      let cursor = `${data.asOf.slice(0, 7)}-01`;
      for (let i = 0; i < 5; i += 1) {
        cursor = addDaysIso(cursor, -1);
        dates.push({ label: cursor, asOf: cursor });
        cursor = `${cursor.slice(0, 7)}-01`;
      }
    }
    const results = await Promise.all(dates.map((d) => bsFor(ctx, d.asOf)));
    const main = results[0]!;
    return {
      accountingBasis: ctx.accountingBasis,
      basis: `${ctx.accountingBasis === "cash" ? "Cash basis; " : ""}As at ${data.asOf}; earnings split at financial-year start ${main.fyStart ?? "n/a"}`,
      columns: dates,
      statement: serialiseStatement(buildBalanceSheetStatement(results)),
      fyStart: main.fyStart,
      assets: num(main.assets),
      liabilities: num(main.liabilities),
      equity: num(main.equity),
      retainedEarningsMinor: num(main.retainedEarningsMinor),
      currentYearEarningsMinor: num(main.currentYearEarningsMinor),
      equationHolds: main.equationHolds,
    };
  });

/* ------------------------------------------------------------------ */
/* Statement of changes in equity (simple)                             */
/* ------------------------------------------------------------------ */

export const getEquityChanges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      from: string;
      to: string;
      basis?: AccountingBasis | undefined;
    }) => ({
      companyId: companyId(input),
      basis: parseAccountingBasis(input.basis),
      from: isoDate(input.from, "From"),
      to: isoDate(input.to, "To"),
    }),
  )
  .handler(async ({ data, context }) => {
    const ctx = await loadCtx(
      context.supabase,
      data.companyId,
      "basis" in data ? parseAccountingBasis(data.basis) : undefined,
    );
    const openingDate = addDaysIso(data.from, -1);
    const [opening, closing, pl] = await Promise.all([
      bsFor(ctx, openingDate),
      bsFor(ctx, data.to),
      plFor(ctx, data.from, data.to),
    ]);
    const openingEq = new Map<string, { code: string; name: string; v: bigint }>();
    const closingEq = new Map<string, { code: string; name: string; v: bigint }>();
    for (const [res, map] of [
      [opening, openingEq],
      [closing, closingEq],
    ] as const) {
      for (const r of res.rows) {
        if (r.account_type !== "equity" || r.account_id.startsWith("__")) continue;
        map.set(r.account_id, { code: r.code, name: r.name, v: r.credit_minor - r.debit_minor });
      }
    }
    const ids = new Set([...openingEq.keys(), ...closingEq.keys()]);
    const movements = [...ids]
      .map((id) => {
        const o = openingEq.get(id);
        const c = closingEq.get(id);
        return {
          code: (c ?? o)!.code,
          name: (c ?? o)!.name,
          opening: num(o?.v ?? 0n),
          closing: num(c?.v ?? 0n),
          movement: num((c?.v ?? 0n) - (o?.v ?? 0n)),
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
    const profit = pl.net;
    const unexplained =
      closing.equity -
      opening.equity -
      profit -
      movements.reduce((a, m) => a + BigInt(m.movement), 0n);
    return {
      basis:
        ctx.accountingBasis === "cash"
          ? "Cash basis statement of changes in equity"
          : "Simple statement of changes in equity from the posted ledger",
      accountingBasis: ctx.accountingBasis,
      openingEquity: num(opening.equity),
      closingEquity: num(closing.equity),
      netProfit: num(profit),
      movements,
      /** Non-zero only if prior-year earnings roll differently between the two dates. */
      otherMovement: num(unexplained),
    };
  });

/* ------------------------------------------------------------------ */
/* Account transactions (single account, paged) and full GL            */
/* ------------------------------------------------------------------ */

export const getAccountTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      accountId: string;
      basis?: AccountingBasis | undefined;
      from: string;
      to: string;
      page?: number;
      pageSize?: number;
      source?: string;
      query?: string;
      flow?: TransactionFlow;
      sort?: TransactionSort;
      minAmount?: string;
      maxAmount?: string;
    }) => ({
      companyId: companyId(input),
      accountId: assertUuid(input.accountId, "account"),
      basis: parseAccountingBasis(input.basis),
      from: isoDate(input.from, "From"),
      to: isoDate(input.to, "To"),
      page: Math.min(100000, Math.max(0, Math.floor(Number(input.page ?? 0)) || 0)),
      pageSize: [25, 50, 100, 200].includes(Number(input.pageSize)) ? Number(input.pageSize) : 100,
      source:
        typeof input.source === "string" && /^[a-z_]{1,40}$/.test(input.source) ? input.source : "",
      query: typeof input.query === "string" ? input.query.trim().slice(0, 120) : "",
      minAmount:
        input.minAmount && /^\d{1,12}(?:\.\d{1,3})?$/.test(input.minAmount) ? input.minAmount : "",
      maxAmount:
        input.maxAmount && /^\d{1,12}(?:\.\d{1,3})?$/.test(input.maxAmount) ? input.maxAmount : "",
      flow: input.flow === "debit" || input.flow === "credit" ? input.flow : ("all" as const),
      sort: (["date_asc", "date_desc", "amount_asc", "amount_desc"] as string[]).includes(
        input.sort ?? "",
      )
        ? input.sort!
        : ("date_asc" as const),
    }),
  )
  .handler(async ({ data, context }) => {
    if (data.to < data.from) throw new Error("'To' date cannot be before 'From' date.");
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    const meta = await loadCompanyMeta(context.supabase, data.companyId);
    const accountingBasis = await resolveReportingBasis(
      context.supabase,
      data.companyId,
      data.basis,
    );
    const { data: acct, error } = await context.supabase
      .from("accounts" as never)
      .select("id, code, name, account_type, normal_balance" as never)
      .eq("id" as never, data.accountId as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!acct) throw new Error("Account not found.");
    const account = acct as unknown as {
      id: string;
      code: string;
      name: string;
      account_type: string;
      normal_balance: string;
    };
    const sign = account.normal_balance === "credit" ? -1n : 1n;
    const currencyPlaces = decimalPlacesFor(meta.baseCurrency);
    for (const value of [data.minAmount, data.maxAmount]) {
      if (value && (value.split(".")[1]?.length ?? 0) > currencyPlaces)
        throw new Error(
          `Amount filters for ${meta.baseCurrency} support ${currencyPlaces} decimal places.`,
        );
    }
    const minAmountMinor = data.minAmount
      ? toMinorUnits(data.minAmount, meta.baseCurrency)
      : undefined;
    const maxAmountMinor = data.maxAmount
      ? toMinorUnits(data.maxAmount, meta.baseCurrency)
      : undefined;
    if (minAmountMinor != null && maxAmountMinor != null && minAmountMinor > maxAmountMinor)
      throw new Error("Minimum movement cannot exceed maximum movement.");
    // The standard unfiltered report continues to use the efficient SQL window-function RPC.
    // For advanced filters, fetch ALL posted lines for the selected account, calculate
    // running balances over the complete chronology, then filter/sort before pagination.
    // Filtering after the RPC's 100-row page would create incorrect totals and paging.
    const filtered = Boolean(
      data.source ||
      data.query ||
      data.minAmount ||
      data.maxAmount ||
      data.flow !== "all" ||
      data.sort !== "date_asc",
    );
    let page: AccountTxnPage;
    if (!filtered && accountingBasis === "accrual") {
      page = await fetchAccountTransactionsPage(context.supabase, meta.id, meta.baseCurrency, {
        accountId: data.accountId,
        from: data.from,
        to: data.to,
        limit: data.pageSize,
        offset: data.page * data.pageSize,
      });
    } else {
      const cashLines =
        accountingBasis === "cash"
          ? await loadCashReportLines(context.supabase, meta.id, "0001-01-01", data.to)
          : null;
      const [opening, lines] = cashLines
        ? ([
            cashLines
              .filter((line) => line.account_id === data.accountId && line.journal_date < data.from)
              .reduce(
                (sum, line) => sum + BigInt(line.debit_minor) - BigInt(line.credit_minor),
                0n,
              ),
            cashLines.filter(
              (line) => line.account_id === data.accountId && line.journal_date >= data.from,
            ),
          ] as const)
        : await Promise.all([
            fetchAccountBalanceAsOf(
              context.supabase,
              meta.id,
              meta.baseCurrency,
              data.accountId,
              addDaysIso(data.from, -1),
            ),
            loadPostedLines(context.supabase, meta.id, meta.baseCurrency, {
              from: data.from,
              to: data.to,
              accountIds: [data.accountId],
            }),
          ]);
      lines.sort(
        (a, b) =>
          a.journal_date.localeCompare(b.journal_date) ||
          (a.journal_number ?? 0) - (b.journal_number ?? 0) ||
          (a.line_no ?? 0) - (b.line_no ?? 0) ||
          (a.line_id ?? "").localeCompare(b.line_id ?? ""),
      );
      let running = opening;
      const fullRows = lines.map((line) => {
        const debit = BigInt(line.debit_minor);
        const credit = BigInt(line.credit_minor);
        running += debit - credit;
        return {
          line_id: line.line_id ?? `${line.journal_id}:${line.line_no ?? 0}`,
          journal_id: line.journal_id ?? "",
          journal_number: line.journal_number ?? 0,
          journal_date: line.journal_date,
          line_no: line.line_no ?? 0,
          memo: line.memo ?? null,
          description: line.description ?? null,
          source_type: line.source_type ?? "other",
          source_id: line.source_id ?? null,
          debit_minor: debit,
          credit_minor: credit,
          running_balance_minor: running,
        };
      });
      const matching = filterTransactionRows(fullRows, {
        source: data.source,
        query: data.query,
        flow: data.flow,
        sort: data.sort,
        minAmountMinor,
        maxAmountMinor,
      });
      page = {
        opening_balance_minor: opening,
        closing_balance_minor: running,
        total_count: matching.length,
        rows: matching.slice(data.page * data.pageSize, (data.page + 1) * data.pageSize),
      };
    }
    // Source metadata is queried only for journals on the requested page, tenant-scoped
    // and posted-only. These fields support genuine advanced columns (not placeholder UI).
    const journalIds = [...new Set(page.rows.map((row) => row.journal_id))].filter(Boolean);
    const headerMap = new Map<
      string,
      {
        currency_code: string;
        fx_rate_to_base: number | string | null;
        posted_at: string | null;
        posted_by: string | null;
        created_by: string | null;
      }
    >();
    if (journalIds.length) {
      const { data: journalHeaders, error: journalError } = await context.supabase
        .from("journals" as never)
        .select("id, currency_code, fx_rate_to_base, posted_at, posted_by, created_by" as never)
        .eq("company_id" as never, meta.id as never)
        .eq("status" as never, "posted" as never)
        .in("id" as never, journalIds as never);
      if (journalError) throw new Error(journalError.message);
      for (const item of (journalHeaders ?? []) as Array<{
        id: string;
        currency_code: string;
        fx_rate_to_base: number | string | null;
        posted_at: string | null;
        posted_by: string | null;
        created_by: string | null;
      }>) {
        headerMap.set(item.id, item);
      }
      if (headerMap.size !== journalIds.length)
        throw new Error(
          "Some posted journal metadata is not accessible; cannot produce a complete report.",
        );
    }
    return {
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        normalBalance: account.normal_balance,
      },
      accountingBasis,
      // Opening/closing balances are for the full selected-basis account.
      opening_balance_minor: num(page.opening_balance_minor * sign),
      closing_balance_minor: num(page.closing_balance_minor * sign),
      total_count: page.total_count,
      filtered,
      page: data.page,
      pageSize: data.pageSize,
      rows: page.rows.map((row) => {
        const header = headerMap.get(row.journal_id);
        return {
          line_id: row.line_id,
          line_no: row.line_no,
          journal_id: row.journal_id,
          journal_number: row.journal_number,
          journal_date: row.journal_date,
          memo: row.memo,
          description: row.description,
          source_type: row.source_type,
          source_id: row.source_id,
          currency_code: header?.currency_code ?? meta.baseCurrency,
          fx_rate_to_base: header?.fx_rate_to_base ?? null,
          posted_at: header?.posted_at ?? null,
          posted_by: header?.posted_by ?? null,
          created_by: header?.created_by ?? null,
          debit_minor: num(row.debit_minor),
          credit_minor: num(row.credit_minor),
          running_balance_minor: num(row.running_balance_minor * sign),
        };
      }),
    };
  });

export const getGeneralLedgerAll = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      from: string;
      to: string;
      accountIds?: string;
      basis?: AccountingBasis | undefined;
      accountScope?: "transactions" | "balance" | "all";
    }) => ({
      companyId: companyId(input),
      from: isoDate(input.from, "From"),
      to: isoDate(input.to, "To"),
      basis: parseAccountingBasis(input.basis),
      accountIds: parseReportAccountIds(input.accountIds),
      accountScope:
        input.accountScope === "transactions" || input.accountScope === "all"
          ? input.accountScope
          : ("balance" as const),
    }),
  )
  .handler(async ({ data, context }) => {
    if (data.to < data.from) throw new Error("'To' date cannot be before 'From' date.");
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    const ctx = await loadCtx(
      context.supabase,
      data.companyId,
      "basis" in data ? parseAccountingBasis(data.basis) : undefined,
    );
    if (data.accountIds.length > 100) throw new Error("Too many selected accounts.");
    // Never silently accept a cross-organisation account ID.
    if (data.accountIds.some((id) => !ctx.byId.has(id))) throw new Error("Account not found.");
    const selected = data.accountIds.length ? new Set(data.accountIds) : null;
    const base = ctx.meta.baseCurrency;
    const openingDate = addDaysIso(data.from, -1);
    const cashLines =
      ctx.accountingBasis === "cash"
        ? await loadCashReportLines(ctx.supabase, ctx.meta.id, "0001-01-01", data.to)
        : null;
    const [openingBal, lines] = cashLines
      ? ([
          cashLines
            .filter((line) => line.journal_date < data.from)
            .map((line) => ({
              account_id: line.account_id,
              debit_minor: BigInt(line.debit_minor),
              credit_minor: BigInt(line.credit_minor),
            })),
          cashLines.filter((line) => line.journal_date >= data.from),
        ] as const)
      : await Promise.all([
          fetchLedgerBalances(ctx.supabase, ctx.meta.id, base, { to: openingDate }),
          loadPostedLines(ctx.supabase, ctx.meta.id, base, { from: data.from, to: data.to }),
        ]);
    const opening = new Map<string, bigint>();
    for (const b of openingBal) {
      if (!selected || selected.has(b.account_id))
        opening.set(
          b.account_id,
          (opening.get(b.account_id) ?? 0n) + b.debit_minor - b.credit_minor,
        );
    }
    const byAccount = new Map<string, PostedLine[]>();
    for (const l of lines) {
      if (selected && !selected.has(l.account_id)) continue;
      const arr = byAccount.get(l.account_id) ?? [];
      arr.push(l);
      byAccount.set(l.account_id, arr);
    }
    const ids = new Set(
      data.accountScope === "all"
        ? selected
          ? [...selected]
          : ctx.accounts.map((a) => a.id)
        : [...opening.keys(), ...byAccount.keys()],
    );
    const accounts = [...ids]
      .map((id) => ctx.byId.get(id))
      .filter((a): a is AccountMeta => Boolean(a))
      .filter((a) =>
        shouldIncludeLedgerAccount(
          data.accountScope,
          byAccount.get(a.id)?.length ?? 0,
          opening.get(a.id) ?? 0n,
        ),
      )
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((a) => {
        const sign = a.account_type === "asset" || a.account_type === "expense" ? 1n : -1n;
        const open = opening.get(a.id) ?? 0n;
        const accLines = (byAccount.get(a.id) ?? []).sort(
          (x, y) =>
            x.journal_date.localeCompare(y.journal_date) ||
            (x.journal_number ?? 0) - (y.journal_number ?? 0),
        );
        let running = open;
        const rows = accLines.map((l) => {
          running += BigInt(l.debit_minor) - BigInt(l.credit_minor);
          return {
            journal_id: l.journal_id ?? "",
            journal_number: l.journal_number ?? 0,
            journal_date: l.journal_date,
            memo: l.memo ?? l.description ?? null,
            source_type: l.source_type ?? "other",
            source_id: l.source_id ?? null,
            debit_minor: num(BigInt(l.debit_minor)),
            credit_minor: num(BigInt(l.credit_minor)),
            running_balance_minor: num(running * sign),
          };
        });
        return {
          account: { id: a.id, code: a.code, name: a.name, account_type: a.account_type },
          opening_balance_minor: num(open * sign),
          closing_balance_minor: num(running * sign),
          rows,
        };
      });
    return {
      accounts,
      lineCount: accounts.reduce((sum, a) => sum + a.rows.length, 0),
      accountingBasis: ctx.accountingBasis,
    };
  });

/* ------------------------------------------------------------------ */
/* Aged receivables / payables                                         */
/* ------------------------------------------------------------------ */

type AgedBase = {
  rows: ReturnType<typeof buildAgingReport>["rows"];
  total: bigint;
  byBucket: ReturnType<typeof buildAgingReport>["byBucket"];
};

function serialiseAged(aged: AgedBase) {
  return {
    rows: aged.rows.map((r) => ({
      ...r,
      current: num(r.current),
      b_1_30: num(r.b_1_30),
      b_31_60: num(r.b_31_60),
      b_61_90: num(r.b_61_90),
      b_90_plus: num(r.b_90_plus),
      total: num(r.total),
      docs: r.docs.map((d) => ({ ...d, outstanding_minor: num(BigInt(d.outstanding_minor)) })),
    })),
    total: num(aged.total),
    byBucket: {
      current: num(aged.byBucket.current),
      "1_30": num(aged.byBucket["1_30"]),
      "31_60": num(aged.byBucket["31_60"]),
      "61_90": num(aged.byBucket["61_90"]),
      "90_plus": num(aged.byBucket["90_plus"]),
    },
  };
}

export async function controlBalance(
  ctx: Ctx,
  role: "ar" | "ap",
  asOf: string,
): Promise<{ net: bigint; ids: string[] }> {
  const ids = findControlAccountIds(ctx.accounts, role);
  let net = 0n;
  for (const id of ids) {
    net += await fetchAccountBalanceAsOf(
      ctx.supabase,
      ctx.meta.id,
      ctx.meta.baseCurrency,
      id,
      asOf,
    );
  }
  return { net, ids };
}

export const getAgedReceivables = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; asOf: string }) => ({
    companyId: companyId(input),
    asOf: isoDate(input.asOf, "As at"),
  }))
  .handler(async ({ data, context }) => {
    const ctx = await loadCtx(
      context.supabase,
      data.companyId,
      "basis" in data ? parseAccountingBasis(data.basis) : undefined,
    );
    type Row = {
      id: string;
      contact_id: string;
      invoice_date: string;
      due_date: string;
      invoice_number: string | null;
      currency_code: string;
      total_minor: number;
      amount_paid_minor: number;
      amount_credited_minor: number;
      posted_journal_id: string | null;
      contacts: { name: string } | null;
    };
    const raw = await fetchAllPages<Row>(
      (from, to) =>
        context.supabase
          .from("sales_invoices" as never)
          .select(
            "id, contact_id, invoice_date, due_date, invoice_number, currency_code, total_minor, amount_paid_minor, amount_credited_minor, posted_journal_id, contacts(name)" as never,
          )
          .eq("company_id" as never, data.companyId as never)
          .in("status" as never, ["authorised", "partly_paid"] as never)
          .order("id" as never)
          .range(from, to) as unknown as PromiseLike<PageResult<Row>>,
    );
    // Only documents posted to the ledger belong in AR ageing (excludes volume UI shells).
    const posted = raw.filter((r) => Boolean(r.posted_journal_id));
    const foreign = posted.filter((r) => r.currency_code !== ctx.meta.baseCurrency).length;
    const docs: AgingDoc[] = posted.map((r) => ({
      id: r.id,
      contact_id: r.contact_id,
      contact_name: r.contacts?.name ?? "Unknown",
      doc_date: r.invoice_date,
      due_date: r.due_date,
      reference: r.invoice_number,
      outstanding_minor: invoiceOutstanding({
        total_minor: r.total_minor,
        amount_paid_minor: r.amount_paid_minor,
        amount_credited_minor: r.amount_credited_minor,
      }),
    }));
    const aged = buildAgingReport(docs, { asOf: data.asOf });
    const control = await controlBalance(ctx, "ar", data.asOf);
    const variance = aged.total - control.net;
    return {
      ...serialiseAged(aged),
      arControlBalanceMinor: num(control.net),
      varianceMinor: num(variance),
      tiesToControl: control.ids.length > 0 && variance === 0n,
      controlAccountFound: control.ids.length > 0,
      excludedUnpostedCount: raw.length - posted.length,
      foreignCurrencyDocuments: foreign,
      diagnostic:
        control.ids.length === 0
          ? "No accounts-receivable control account found (set system key 'ar' on the chart)."
          : variance === 0n
            ? null
            : "Subledger total differs from the receivables control account. Check manual journals to AR, unallocated receipts, or documents posted without allocation updates.",
    };
  });

export const getAgedPayables = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; asOf: string }) => ({
    companyId: companyId(input),
    asOf: isoDate(input.asOf, "As at"),
  }))
  .handler(async ({ data, context }) => {
    const ctx = await loadCtx(
      context.supabase,
      data.companyId,
      "basis" in data ? parseAccountingBasis(data.basis) : undefined,
    );
    const defaults = await loadCompanyDefaults(context.supabase, data.companyId);
    assertCurrentPayablesDate(data.asOf, defaults.today);
    type Row = {
      id: string;
      contact_id: string;
      bill_date: string;
      due_date: string;
      supplier_invoice_number: string | null;
      currency_code: string;
      fx_rate_to_base: number | string | null;
      total_minor: number;
      amount_paid_minor: number;
      amount_credited_minor: number;
      posted_journal_id: string | null;
      contacts: { name: string } | null;
    };
    const raw = await fetchAllPages<Row>(
      (from, to) =>
        context.supabase
          .from("purchase_bills" as never)
          .select(
            "id, contact_id, bill_date, due_date, supplier_invoice_number, currency_code, fx_rate_to_base, total_minor, amount_paid_minor, amount_credited_minor, posted_journal_id, contacts(name)" as never,
          )
          .eq("company_id" as never, data.companyId as never)
          .in("status" as never, ["authorised", "partly_paid"] as never)
          .lte("bill_date" as never, data.asOf as never)
          .order("id" as never)
          .range(from, to) as unknown as PromiseLike<PageResult<Row>>,
    );
    const posted = raw.filter((r) => Boolean(r.posted_journal_id));
    // Convert foreign bills with the snapshot rate so the total is comparable with the GL (RP-07).
    const docs: AgingDoc[] = posted.map((r) => {
      const outstanding = billOutstanding({
        total_minor: r.total_minor,
        amount_paid_minor: r.amount_paid_minor,
        amount_credited_minor: r.amount_credited_minor,
      });
      const converted = payableOutstandingInBase(
        outstanding,
        r.currency_code,
        ctx.meta.baseCurrency,
        r.fx_rate_to_base,
      );
      return {
        id: r.id,
        contact_id: r.contact_id,
        contact_name: r.contacts?.name ?? "Unknown",
        doc_date: r.bill_date,
        due_date: r.due_date,
        reference: r.supplier_invoice_number,
        outstanding_minor: converted,
      };
    });
    const aged = buildAgingReport(docs, { asOf: data.asOf });
    const control = await controlBalance(ctx, "ap", data.asOf);
    // AP is credit-normal: outstanding docs should equal the credit balance.
    const controlCredit = -control.net;
    const variance = aged.total - controlCredit;
    return {
      ...serialiseAged(aged),
      apControlBalanceMinor: num(controlCredit),
      varianceMinor: num(variance),
      tiesToControl: control.ids.length > 0 && variance === 0n,
      controlAccountFound: control.ids.length > 0,
      excludedUnpostedCount: raw.length - posted.length,
      diagnostic:
        control.ids.length === 0
          ? "No accounts-payable control account found (set system key 'ap' on the chart)."
          : variance === 0n
            ? null
            : "Subledger total differs from the payables control account. Check manual journals to AP or bills without posted journals.",
    };
  });

/* ------------------------------------------------------------------ */
/* Cash flow                                                           */
/* ------------------------------------------------------------------ */

export async function bankAccountIds(ctx: Ctx): Promise<string[]> {
  const { data: banks, error } = await ctx.supabase
    .from("bank_accounts" as never)
    .select("gl_account_id" as never)
    .eq("company_id" as never, ctx.meta.id as never)
    .eq("is_active" as never, true as never);
  if (error) throw new Error(error.message);
  const ids = new Set(
    ((banks ?? []) as Array<{ gl_account_id: string }>).map((b) => b.gl_account_id),
  );
  for (const id of findControlAccountIds(ctx.accounts, "bank")) ids.add(id);
  return [...ids];
}

const JOURNAL_ID_CHUNK = 120;

export const getCashFlow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      from: string;
      to: string;
      basis?: AccountingBasis | undefined;
    }) => ({
      companyId: companyId(input),
      basis: parseAccountingBasis(input.basis),
      from: isoDate(input.from, "From"),
      to: isoDate(input.to, "To"),
    }),
  )
  .handler(async ({ data, context }) => {
    const ctx = await loadCtx(
      context.supabase,
      data.companyId,
      "basis" in data ? parseAccountingBasis(data.basis) : undefined,
    );
    const base = ctx.meta.baseCurrency;
    const bankIds = await bankAccountIds(ctx);
    const openingDate = addDaysIso(data.from, -1);

    // Opening cash and closing ledger cash come from SQL aggregates on the bank accounts.
    const [openingBal, closingBal] = await Promise.all([
      fetchLedgerBalances(ctx.supabase, ctx.meta.id, base, { to: openingDate }),
      fetchLedgerBalances(ctx.supabase, ctx.meta.id, base, { to: data.to }),
    ]);
    const bankSet = new Set(bankIds);
    const sumBank = (rows: typeof openingBal) =>
      rows
        .filter((b) => bankSet.has(b.account_id))
        .reduce((n, b) => n + b.debit_minor - b.credit_minor, 0n);
    const openingCash = sumBank(openingBal);
    const closingLedger = sumBank(closingBal);

    // Journals that touched a bank account in the period, then ALL their lines (counterparts).
    const bankLines = bankIds.length
      ? await loadPostedLines(ctx.supabase, ctx.meta.id, base, {
          from: data.from,
          to: data.to,
          accountIds: bankIds,
        })
      : [];
    const journalIds = [
      ...new Set(bankLines.map((l) => l.journal_id).filter((v): v is string => Boolean(v))),
    ];
    const lines: PostedLine[] = [];
    for (let i = 0; i < journalIds.length; i += JOURNAL_ID_CHUNK) {
      const chunk = journalIds.slice(i, i + JOURNAL_ID_CHUNK);
      lines.push(
        ...(await loadPostedLines(ctx.supabase, ctx.meta.id, base, { journalIds: chunk })),
      );
    }
    const synthetic: PostedLine[] = bankIds.length
      ? [
          {
            account_id: bankIds[0]!,
            account_code: "",
            account_name: "Opening cash",
            account_type: "asset",
            journal_date: openingDate,
            debit_minor: openingCash > 0n ? openingCash : 0n,
            credit_minor: openingCash < 0n ? -openingCash : 0n,
            fx_rate_to_base: null,
            currency_code: base,
            base_currency: base,
          },
        ]
      : [];
    const result = buildCashFlowFromBank([...synthetic, ...lines], {
      from: data.from,
      to: data.to,
      bankAccountIds: bankIds,
    });
    return {
      operating: num(result.operating),
      investing: num(result.investing),
      financing: num(result.financing),
      net_change: num(result.net_change),
      opening_cash: num(result.opening_cash),
      closing_cash: num(result.closing_cash),
      closing_cash_ledger: num(closingLedger),
      reconciles: result.closing_cash === closingLedger,
      rows: result.rows.map((r) => ({ ...r, amount_minor: num(r.amount_minor) })),
      detail: result.detail.map((d) => ({ ...d, amount_minor: num(d.amount_minor) })),
      bankAccountCount: bankIds.length,
      method: "bank_direct_classified",
      accountingBasis: ctx.accountingBasis,
      limitation: result.limitation,
    };
  });

/* ------------------------------------------------------------------ */
/* Tax control summary                                                 */
/* ------------------------------------------------------------------ */

export const getTaxReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; from: string; to: string; basis?: string }) => ({
    companyId: companyId(input),
    from: isoDate(input.from, "From"),
    to: isoDate(input.to, "To"),
    basis: parseAccountingBasis(input.basis),
  }))
  .handler(async ({ data, context }) => {
    if (data.to < data.from) throw new Error("'To' date cannot be before 'From' date.");
    const ctx = await loadCtx(
      context.supabase,
      data.companyId,
      "basis" in data ? parseAccountingBasis(data.basis) : undefined,
    );
    const { data: settings } = await context.supabase
      .from("company_tax_settings" as never)
      .select(
        "output_tax_account_id, input_tax_account_id, tax_regime, jurisdiction_code, tax_basis" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    const s = settings as {
      output_tax_account_id: string | null;
      input_tax_account_id: string | null;
      tax_regime: string;
      jurisdiction_code: string | null;
      tax_basis?: string | null;
    } | null;
    // Same document-line logic as the VAT return, on the chosen basis (TX-04). The default is
    // the basis the company files on.
    const settingsBasis: "cash" | "accrual" = s?.tax_basis === "cash" ? "cash" : "accrual";
    const basis = data.basis ?? settingsBasis;
    const taxFacts = await loadTaxFacts(ctx.supabase, {
      companyId: data.companyId,
      from: data.from,
      to: data.to,
      basis,
      baseCurrency: ctx.meta.baseCurrency,
    });
    const totals = computeReturnTotals(taxFacts.facts);
    const taxIds = resolveTaxAccountIds(ctx.accounts, s);
    const lines = taxIds.length
      ? await loadPostedLines(ctx.supabase, ctx.meta.id, ctx.meta.baseCurrency, {
          from: data.from,
          to: data.to,
          accountIds: taxIds,
        })
      : [];
    const result = buildTaxSummary(lines, { from: data.from, to: data.to, taxAccountIds: taxIds });
    return {
      regime: s?.tax_regime ?? "none",
      jurisdictionCode: s?.jurisdiction_code ?? null,
      taxAccountCount: taxIds.length,
      basis,
      settingsBasis,
      detailMode: basis === "cash" ? ("cash_recognition" as const) : ("posted_controls" as const),
      cashRecognitionDetails:
        basis === "cash"
          ? taxFacts.facts.map((fact) => {
              if (!fact.source)
                throw new Error("Cash tax recognition is missing its source transaction");
              const recognised = computeReturnTotals([fact]);
              return {
                source_type: fact.source.type,
                source_id: fact.source.id,
                source_line_id: fact.source.lineId,
                recognition_date: fact.source.date,
                settlement_id: fact.source.settlementId ?? null,
                side: fact.side,
                treatment: fact.treatment,
                net_minor: num(recognised.salesNet + recognised.purchasesNet),
                output_tax_minor: num(recognised.outputTax),
                input_tax_minor: num(recognised.inputTax),
                net_tax_minor: num(recognised.netTax),
              };
            })
          : [],
      documents: {
        count: taxFacts.documents,
        skippedNoRate: taxFacts.skippedNoRate,
        output_tax_minor: num(totals.outputTax),
        input_tax_minor: num(totals.inputTax),
        net_tax_minor: num(totals.netTax),
        non_recoverable_tax_minor: num(totals.nonRecoverableTax),
        sales_net_minor: num(totals.salesNet),
        purchases_net_minor: num(totals.purchasesNet),
        reverse_charge_lines: totals.counts.reverseCharge,
        self_assessed_lines: totals.counts.selfAssessed,
        uncoded_lines: totals.counts.uncoded,
        rows: summariseByTreatment(taxFacts.facts).map((r) => ({
          side: r.side,
          treatment: r.treatment,
          self_assessed: r.selfAssessed,
          lines: r.lines,
          net_minor: num(r.netBase),
          tax_minor: num(r.taxBase),
        })),
      },
      output_credit_minor: num(result.output_credit_minor),
      input_debit_minor: num(result.input_debit_minor),
      net_payable_minor: num(result.net_payable_minor),
      rows: result.rows.map((r) => ({
        ...r,
        debit_minor: num(r.debit_minor),
        credit_minor: num(r.credit_minor),
      })),
      detail: result.detail.map((l) => ({
        account_id: l.account_id,
        account_code: l.account_code,
        account_name: l.account_name,
        journal_id: l.journal_id ?? "",
        journal_number: l.journal_number ?? 0,
        journal_date: l.journal_date,
        source_type: l.source_type ?? "",
        source_id: l.source_id ?? null,
        debit_minor: num(BigInt(l.debit_minor)),
        credit_minor: num(BigInt(l.credit_minor)),
      })),
      complianceNote:
        basis === "cash"
          ? "Cash recognition details use the same dated allocations and source tax lines as the totals. Posted tax-control movements are shown separately and include payments to the tax authority."
          : "The totals at the top come from document tax lines on the chosen basis, the same way the VAT return is calculated. The table below lists movements on the tax control accounts by posting date (includes payments to the tax authority), so it can differ when tax was paid.",
    };
  });

/* ------------------------------------------------------------------ */
/* Journal report (filters and ordering in the query: RP-02)           */
/* ------------------------------------------------------------------ */

export const getJournalReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      from?: string;
      to?: string;
      status?: string;
      source?: string;
      page?: number;
      pageSize?: number;
    }) => ({
      companyId: companyId(input),
      from: optIsoDate(input.from, "From"),
      to: optIsoDate(input.to, "To"),
      status: (input.status ?? "").trim().slice(0, 20),
      source: (input.source ?? "").trim().slice(0, 40),
      page: Math.max(0, Math.floor(Number(input.page ?? 0)) || 0),
      pageSize: Math.min(200, Math.max(10, Math.floor(Number(input.pageSize ?? 100)) || 100)),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    let q = context.supabase
      .from("journals" as never)
      .select(
        "id, journal_number, journal_date, status, source_type, source_id, memo, currency_code, journal_lines(debit_minor, credit_minor)" as never,
        { count: "exact" } as never,
      )
      .eq("company_id" as never, data.companyId as never);
    if (data.status) q = q.eq("status" as never, data.status as never);
    if (data.source) q = q.eq("source_type" as never, data.source as never);
    if (data.from) q = q.gte("journal_date" as never, data.from as never);
    if (data.to) q = q.lte("journal_date" as never, data.to as never);
    const from = data.page * data.pageSize;
    const {
      data: rows,
      error,
      count,
    } = await q
      .order("journal_date" as never, { ascending: false } as never)
      .order("journal_number" as never, { ascending: false } as never)
      .range(from, from + data.pageSize - 1);
    if (error) throw new Error(error.message);
    const mapped = (
      (rows ?? []) as unknown as Array<{
        id: string;
        journal_number: number;
        journal_date: string;
        status: string;
        source_type: string;
        source_id: string | null;
        memo: string | null;
        currency_code: string;
        journal_lines: Array<{ debit_minor: number; credit_minor: number }>;
      }>
    ).map((j) => {
      let d = 0n;
      let c = 0n;
      for (const l of j.journal_lines ?? []) {
        d += BigInt(l.debit_minor);
        c += BigInt(l.credit_minor);
      }
      return {
        journal_id: j.id,
        journal_number: j.journal_number,
        journal_date: j.journal_date,
        status: j.status,
        source_type: j.source_type,
        source_id: j.source_id,
        memo: j.memo,
        currency_code: j.currency_code,
        total_debit_minor: num(d),
        total_credit_minor: num(c),
      };
    });
    return {
      rows: mapped,
      total: count ?? mapped.length,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

/* ------------------------------------------------------------------ */
/* Audit trail (actor names, details, filters, pagination: RP-13)      */
/* ------------------------------------------------------------------ */

export const getAuditReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      from?: string;
      to?: string;
      actorId?: string;
      entityType?: string;
      action?: string;
      page?: number;
      pageSize?: number;
    }) => ({
      companyId: companyId(input),
      from: optIsoDate(input.from, "From"),
      to: optIsoDate(input.to, "To"),
      actorId: input.actorId ? assertUuid(input.actorId, "user") : undefined,
      entityType: (input.entityType ?? "").trim().slice(0, 60),
      action: (input.action ?? "").trim().slice(0, 80),
      page: Math.max(0, Math.floor(Number(input.page ?? 0)) || 0),
      pageSize: Math.min(200, Math.max(10, Math.floor(Number(input.pageSize ?? 50)) || 50)),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "audit.view");
    let q = context.supabase
      .from("audit_events" as never)
      .select(
        "id, action, entity_type, entity_id, details, created_at, actor_user_id" as never,
        {
          count: "exact",
        } as never,
      )
      .eq("company_id" as never, data.companyId as never);
    if (data.from) q = q.gte("created_at" as never, `${data.from}T00:00:00Z` as never);
    if (data.to) q = q.lte("created_at" as never, `${data.to}T23:59:59.999Z` as never);
    if (data.actorId) q = q.eq("actor_user_id" as never, data.actorId as never);
    if (data.entityType) q = q.eq("entity_type" as never, data.entityType as never);
    if (data.action)
      q = q.ilike("action" as never, `%${data.action.replace(/[%_,()]/g, " ")}%` as never);
    const from = data.page * data.pageSize;
    const {
      data: rows,
      error,
      count,
    } = await q
      .order("created_at" as never, { ascending: false } as never)
      .range(from, from + data.pageSize - 1);
    if (error) throw new Error(error.message);
    const events = (rows ?? []) as unknown as Array<{
      id: string;
      action: string;
      entity_type: string;
      entity_id: string | null;
      details: Record<string, unknown> | null;
      created_at: string;
      actor_user_id: string | null;
    }>;
    const actorIds = [
      ...new Set(events.map((e) => e.actor_user_id).filter((v): v is string => Boolean(v))),
    ];
    const names = new Map<string, string>();
    if (actorIds.length) {
      const { data: profiles } = await context.supabase
        .from("profiles" as never)
        .select("id, full_name, email" as never)
        .in("id" as never, actorIds as never);
      for (const p of (profiles ?? []) as unknown as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
      }>) {
        names.set(p.id, p.full_name?.trim() || p.email || p.id.slice(0, 8));
      }
    }
    return {
      total: count ?? events.length,
      page: data.page,
      pageSize: data.pageSize,
      events: events.map(({ details, ...e }) => ({
        ...e,
        // JSON text keeps the server-function payload strictly serialisable.
        details_json: JSON.stringify(details ?? {}),
        actor_name: e.actor_user_id
          ? (names.get(e.actor_user_id) ?? e.actor_user_id.slice(0, 8))
          : "System",
      })),
    };
  });

/** Distinct actors / entity types for the audit filters (small lists). */
export const getAuditFilterOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyId(input) }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "audit.view");
    const { data: members } = await context.supabase
      .from("company_members" as never)
      .select("user_id, profiles(full_name, email)" as never)
      .eq("company_id" as never, data.companyId as never);
    const actors = (
      (members ?? []) as unknown as Array<{
        user_id: string;
        profiles: { full_name: string | null; email: string | null } | null;
      }>
    ).map((m) => ({
      id: m.user_id,
      name: m.profiles?.full_name?.trim() || m.profiles?.email || m.user_id.slice(0, 8),
    }));
    return { actors };
  });
