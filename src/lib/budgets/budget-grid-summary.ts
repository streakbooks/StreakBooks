/**
 * Pure, precision-safe budget editor totals. All financial values remain
 * integer minor units; total overflow must be surfaced before save or export.
 */
import { sumMinorNumbers, type BudgetAccountKind } from "@/lib/budgets/budget-math";

export type BudgetGridSummaryRow = {
  id: string;
  kind: BudgetAccountKind;
  months: readonly (number | null)[];
};

export type BudgetGridSummary = {
  incomeMonths: number[];
  expenseMonths: number[];
  netMonths: number[];
  incomeYear: number;
  expenseYear: number;
  netYear: number;
};

/** Rejects unsafe row, section, month, year, or net totals; null cells are treated as zero for preview. */
export function summarizeBudgetGrid(
  rows: readonly BudgetGridSummaryRow[],
  monthCount = 12,
): BudgetGridSummary {
  if (!Number.isInteger(monthCount) || monthCount < 1 || monthCount > 1200) {
    throw new Error("Budget summary requires a valid number of fiscal periods.");
  }
  const incomeMonths = Array.from({ length: monthCount }, () => 0);
  const expenseMonths = Array.from({ length: monthCount }, () => 0);
  const ids = new Set<string>();

  for (const row of rows) {
    if (!row.id || ids.has(row.id)) {
      throw new Error("Budget summary contains a missing or duplicate account.");
    }
    ids.add(row.id);
    if (row.kind !== "income" && row.kind !== "expense") {
      throw new Error("Budget summary accepts only income or expense accounts.");
    }
    if (row.months.length !== monthCount) {
      throw new Error("Every budget summary account requires one value per fiscal period.");
    }
    const amounts = row.months.map((amount) => amount ?? 0);
    // Validate annual row before section aggregation so opposing account rows
    // cannot conceal a single overflowing annual account total.
    sumMinorNumbers(amounts);
    const target = row.kind === "income" ? incomeMonths : expenseMonths;
    for (let i = 0; i < monthCount; i++) {
      target[i] = sumMinorNumbers([target[i]!, amounts[i]!]);
    }
  }
  const incomeYear = sumMinorNumbers(incomeMonths);
  const expenseYear = sumMinorNumbers(expenseMonths);
  const netMonths = incomeMonths.map((amount, i) =>
    sumMinorNumbers([amount, -expenseMonths[i]!]),
  );
  const netYear = sumMinorNumbers([incomeYear, -expenseYear]);
  return { incomeMonths, expenseMonths, netMonths, incomeYear, expenseYear, netYear };
}
