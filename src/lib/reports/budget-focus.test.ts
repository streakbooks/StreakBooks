import { describe, expect, it } from "vitest";
import { computeVariance } from "@/lib/budgets/budget-math";
import type { BudgetVsActual, VarianceCell } from "@/lib/budgets/budget-report";
import { focusBudgetReport } from "./budget-focus";

const cell = (
  kind: "income" | "expense",
  budgetMinor: number,
  actualMinor: number,
): VarianceCell => ({
  budgetMinor,
  actualMinor,
  ...computeVariance(kind, budgetMinor, actualMinor),
});
const original: BudgetVsActual = {
  columns: [{ key: "ytd", label: "Year to date" }],
  income: {
    kind: "income",
    rows: [
      { accountId: "sales", code: "4000", name: "Sales", cells: [cell("income", 10000, 12000)] },
      { accountId: "other", code: "4100", name: "Other", cells: [cell("income", 2000, 1500)] },
    ],
    totals: [cell("income", 12000, 13500)],
  },
  expense: {
    kind: "expense",
    rows: [{ accountId: "rent", code: "6000", name: "Rent", cells: [cell("expense", 3500, 4000)] }],
    totals: [cell("expense", 3500, 4000)],
  },
  net: [cell("income", 8500, 9500)],
};

describe("account-focused Budget versus Actual", () => {
  it("preserves the canonical report when all accounts are selected", () => {
    expect(focusBudgetReport(original, undefined)).toBe(original);
  });

  it("recomputes section, net and favourable variances from selected rows only", () => {
    const report = focusBudgetReport(original, ["sales", "rent"]);
    expect(report.income.rows.map((r) => r.accountId)).toEqual(["sales"]);
    expect(report.income.totals[0]).toMatchObject({
      budgetMinor: 10000,
      actualMinor: 12000,
      varianceMinor: 2000,
    });
    expect(report.expense.totals[0]).toMatchObject({
      budgetMinor: 3500,
      actualMinor: 4000,
      varianceMinor: -500,
    });
    expect(report.net[0]).toMatchObject({
      budgetMinor: 6500,
      actualMinor: 8000,
      varianceMinor: 1500,
    });
    expect(original.income.rows).toHaveLength(2);
    expect(original.net[0]?.actualMinor).toBe(9500);
  });

  it("shows correct zero subtotals for accounts without budget activity", () => {
    const report = focusBudgetReport(original, ["missing"]);
    expect(report.income.rows).toHaveLength(0);
    expect(report.expense.rows).toHaveLength(0);
    expect(report.income.totals[0]?.budgetMinor).toBe(0);
    expect(report.net[0]?.variancePctBps).toBeNull();
  });
});
