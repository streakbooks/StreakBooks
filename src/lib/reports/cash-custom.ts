import { cashLedger } from "./cash-ledger";
import { customColumns, type CustomDefinition } from "./custom-definition";
import { filterCashEntries } from "./cash-report";
import type { CashPnlInput } from "./cash-profit-loss";
import type { ReportingFacts } from "./report-document";
import { CASH_POLICY } from "./cash-standard";
import { aggregateCashEntries, cashReportingFacts } from "./cash-report-facts";

/** Use the same recognized cash ledger for every custom reporting period. */
export function cashCustomFacts(
  base: ReportingFacts,
  input: CashPnlInput,
  definition: CustomDefinition,
): ReportingFacts {
  if (
    definition.basis !== "cash" ||
    input.companyId !== base.company.id ||
    input.baseCurrency !== base.company.baseCurrency
  )
    throw new Error("Custom cash facts must match the requested company and base currency");
  const columns = customColumns(definition, base.from, base.to);
  const lastDate = columns.reduce((last, column) => (column.to > last ? column.to : last), base.to);
  const entries = filterCashEntries(
    cashLedger(input, { from: "0001-01-01", to: lastDate }),
    input,
    definition.filters,
  );
  return {
    ...cashReportingFacts(base, input, definition.filters),
    basis: "cash",
    cashPolicy: CASH_POLICY,
    appliedFilters: definition.filters,
    customColumns: columns.map((column) => ({
      id: column.id,
      from: column.from,
      to: column.to,
      balances:
        column.mode === "calculated"
          ? []
          : aggregateCashEntries(
              entries.filter((entry) => entry.date >= column.from && entry.date <= column.to),
            ),
    })),
  };
}
