import type { ReportingFacts } from "./report-document";
import { standardPeriods } from "./standard-statement";
import type { StandardSettings } from "./standard-settings";
import { cashProfitLoss, type CashPnlInput, type CashPnlEntry } from "./cash-profit-loss";
export const CASH_POLICY = "settled-posted-documents-v1";

/** Shared cash facts for standard layout/comparisons and the isolated browser fixture. */
export function cashStandardFacts(
  base: ReportingFacts,
  input: CashPnlInput,
  settings: StandardSettings,
): ReportingFacts {
  if (
    settings.basis !== "cash" ||
    input.companyId !== base.company.id ||
    input.baseCurrency !== base.company.baseCurrency
  )
    throw new Error("Cash facts must match the requested company and base currency");
  if (settings.filters.clauses.length)
    throw new Error("Clear accrual posted-line filters before running cash basis");
  const plan = standardPeriods(
    "profit-and-loss",
    base.from,
    base.to,
    settings,
    base.company.fyEndMonth,
    base.company.fyEndDay ?? 31,
  );
  const balances = (entries: CashPnlEntry[]) => {
    const grouped = new Map<
      string,
      { account_id: string; debit_minor: bigint; credit_minor: bigint; line_count: number }
    >();
    for (const entry of entries) {
      const row = grouped.get(entry.accountId) ?? {
        account_id: entry.accountId,
        debit_minor: 0n,
        credit_minor: 0n,
        line_count: 0,
      };
      row.debit_minor += entry.debit;
      row.credit_minor += entry.credit;
      row.line_count++;
      grouped.set(entry.accountId, row);
    }
    return [...grouped.values()].map((row) => ({
      ...row,
      debit_minor: row.debit_minor.toString(),
      credit_minor: row.credit_minor.toString(),
    }));
  };
  const columns = plan.periods.map((period) => ({
    ...period,
    fyStart: base.fyStart,
    period: balances(cashProfitLoss(input, period)),
    bsPrior: [],
    bsCurrent: [],
  }));
  return {
    ...base,
    basis: "cash",
    cashPolicy: CASH_POLICY,
    period: columns[0]!.period,
    standardColumns: columns,
    appliedFilters: settings.filters,
  };
}
