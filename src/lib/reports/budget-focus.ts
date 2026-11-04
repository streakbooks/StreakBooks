import { computeVariance } from "@/lib/budgets/budget-math";
import type { BudgetVsActual, VarianceCell, VarianceSection } from "@/lib/budgets/budget-report";

/**
 * Account-focused budget analysis. The canonical whole-company report is not changed;
 * only the selected rows and their derived section/net totals are recalculated.
 * Use the same integer-minor-unit variance arithmetic as the full report.
 */
export function focusBudgetReport(
  source: BudgetVsActual,
  selectedAccountIds: readonly string[] | undefined,
): BudgetVsActual {
  if (!selectedAccountIds) return source;
  const selected = new Set(selectedAccountIds);
  const section = (original: VarianceSection): VarianceSection => {
    const rows = original.rows.filter((row) => selected.has(row.accountId));
    const totals: VarianceCell[] = source.columns.map((_, index) => {
      const budgetMinor = rows.reduce((sum, row) => sum + (row.cells[index]?.budgetMinor ?? 0), 0);
      const actualMinor = rows.reduce((sum, row) => sum + (row.cells[index]?.actualMinor ?? 0), 0);
      return {
        budgetMinor,
        actualMinor,
        ...computeVariance(original.kind, budgetMinor, actualMinor),
      };
    });
    return { ...original, rows, totals };
  };
  const income = section(source.income);
  const expense = section(source.expense);
  const net = source.columns.map((_, index) => {
    const budgetMinor =
      (income.totals[index]?.budgetMinor ?? 0) - (expense.totals[index]?.budgetMinor ?? 0);
    const actualMinor =
      (income.totals[index]?.actualMinor ?? 0) - (expense.totals[index]?.actualMinor ?? 0);
    return {
      budgetMinor,
      actualMinor,
      ...computeVariance("income", budgetMinor, actualMinor),
    };
  });
  return { ...source, income, expense, net };
}
