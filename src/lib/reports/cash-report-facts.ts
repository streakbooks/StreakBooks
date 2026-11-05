import { cashLedger } from "./cash-ledger";
import { CASH_POLICY } from "./cash-standard";
import type { CashPnlInput, CashPnlEntry } from "./cash-profit-loss";
import type { ReportingFacts } from "./report-document";
import { filterCashEntries } from "./cash-report";
import { reportFiltersSchema, type ReportFilters } from "./report-filters";

export function aggregateCashEntries(rows: CashPnlEntry[]): ReportingFacts["period"] {
  const sums = new Map<string, { debit: bigint; credit: bigint; count: number }>();
  for (const entry of rows) {
    const value = sums.get(entry.accountId) ?? { debit: 0n, credit: 0n, count: 0 };
    value.debit += entry.debit;
    value.credit += entry.credit;
    value.count++;
    sums.set(entry.accountId, value);
  }
  return [...sums].map(([account_id, value]) => ({
    account_id,
    debit_minor: value.debit.toString(),
    credit_minor: value.credit.toString(),
    line_count: value.count,
  }));
}

/** Immutable common facts for cash trial balance, management and cash-flow reports. */
export function cashReportingFacts(
  base: ReportingFacts,
  input: CashPnlInput,
  filters: ReportFilters = reportFiltersSchema.parse({}),
): ReportingFacts {
  if (input.companyId !== base.company.id || input.baseCurrency !== base.company.baseCurrency)
    throw new Error("Cash facts must match the requested company and base currency");
  const entries = filterCashEntries(
    cashLedger(input, { from: "0001-01-01", to: base.to > base.priorTo ? base.to : base.priorTo }),
    input,
    filters,
  );
  const between = (from: string, to: string) =>
    entries.filter((entry) => entry.date >= from && entry.date <= to);
  return {
    ...base,
    basis: "cash",
    cashPolicy: CASH_POLICY,
    appliedFilters: filters,
    period: aggregateCashEntries(between(base.from, base.to)),
    prior: aggregateCashEntries(between(base.priorFrom, base.priorTo)),
    bsPrior: aggregateCashEntries(entries.filter((entry) => entry.date < base.fyStart)),
    bsCurrent: aggregateCashEntries(between(base.fyStart, base.to)),
  };
}
