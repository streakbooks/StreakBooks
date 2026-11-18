/**
 * Budget vs Actual report builder (pure). Monetary inputs and aggregates are
 * integer minor units. Accumulate with bigint so large reports never silently
 * round cents; convert only after checking the supported safe-integer range.
 */
import {
  computeVariance,
  type BudgetAccountKind,
  type BudgetColumn,
  type Variance,
} from "@/lib/budgets/budget-math";

export type BudgetReportAccount = {
  id: string;
  code: string;
  name: string;
  kind: BudgetAccountKind;
};

export type MonthAmount = { accountId: string; month: string; amountMinor: number };
export type MonthActivity = {
  accountId: string;
  month: string;
  debitMinor: number;
  creditMinor: number;
};

export type VarianceCell = { budgetMinor: number; actualMinor: number } & Variance;
export type VarianceRow = {
  accountId: string;
  code: string;
  name: string;
  cells: VarianceCell[];
};
export type VarianceSection = {
  kind: BudgetAccountKind;
  rows: VarianceRow[];
  totals: VarianceCell[];
};
export type BudgetVsActual = {
  columns: Array<{ key: string; label: string }>;
  income: VarianceSection;
  expense: VarianceSection;
  /** Income − expenses. Variance is actual − budget (favourable positive). */
  net: VarianceCell[];
};

/**
 * PostgreSQL BIGINT values may arrive as decimal strings. Never convert them
 * with Number() before checking precision: it could silently round the cents.
 * SQL NULL, empty strings and non-integer values are invalid source amounts.
 */
export function parseSafeBudgetMinor(value: unknown, label: string): number {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(label + " must be a safe integer in minor units.");
    }
    return value;
  }
  if (typeof value !== "string" && typeof value !== "bigint") {
    throw new Error(label + " must be an integer in minor units.");
  }
  if (typeof value === "string" && !/^-?\d+$/.test(value)) {
    throw new Error(label + " must be a decimal integer in minor units.");
  }
  const parsed = BigInt(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER) || parsed < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(label + " exceeds the supported safe minor-unit range.");
  }
  return Number(parsed);
}

function asMinor(value: number, label: string): bigint {
  if (!Number.isSafeInteger(value)) {
    throw new Error(label + " must be a safe integer in minor units.");
  }
  return BigInt(value);
}
function asSafe(value: bigint, label: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(label + " exceeds the supported minor-unit range.");
  }
  return Number(value);
}
function cell(kind: BudgetAccountKind, budget: bigint, actual: bigint): VarianceCell {
  const b = asSafe(budget, "Budget total");
  const a = asSafe(actual, "Posted actual total");
  // computeVariance uses bigint rounding for the percentage, but its final
  // public values are numbers; reject unsafe percent/variance conversion too.
  const metrics = computeVariance(kind, b, a);
  if (
    !Number.isSafeInteger(metrics.varianceMinor) ||
    (metrics.variancePctBps !== null && !Number.isSafeInteger(metrics.variancePctBps))
  ) {
    throw new Error("Budget variance exceeds the supported precision.");
  }
  return { budgetMinor: b, actualMinor: a, ...metrics };
}
/** The ledger monthly aggregate includes Balance Sheet as well as P&L accounts. */
export function filterProfitLossActivity<T extends { accountId: string }>(
  accounts: readonly BudgetReportAccount[],
  activity: readonly T[],
): T[] {
  const ids = new Set(accounts.map((account) => account.id));
  return activity.filter((line) => ids.has(line.accountId));
}

function key(accountId: string, month: string): string {
  return accountId + "|" + month;
}

export function buildBudgetVsActual(input: {
  accounts: readonly BudgetReportAccount[];
  budget: readonly MonthAmount[];
  actuals: readonly MonthActivity[];
  columns: readonly BudgetColumn[];
}): BudgetVsActual {
  const accountById = new Map(input.accounts.map((account) => [account.id, account]));
  if (accountById.size !== input.accounts.length) {
    throw new Error("Duplicate account in Budget vs Actual input.");
  }

  const budgetBy = new Map<string, bigint>();
  for (const b of input.budget) {
    if (!accountById.has(b.accountId)) {
      throw new Error("Budget references an unavailable account.");
    }
    const k = key(b.accountId, b.month);
    budgetBy.set(k, (budgetBy.get(k) ?? 0n) + asMinor(b.amountMinor, "Budget amount"));
  }
  const activityBy = new Map<string, { d: bigint; c: bigint }>();
  for (const a of input.actuals) {
    if (!accountById.has(a.accountId)) {
      throw new Error("Posted actual references an unavailable account.");
    }
    const k = key(a.accountId, a.month);
    const prev = activityBy.get(k) ?? { d: 0n, c: 0n };
    activityBy.set(k, {
      d: prev.d + asMinor(a.debitMinor, "Posted debit"),
      c: prev.c + asMinor(a.creditMinor, "Posted credit"),
    });
  }

  const sections: Record<BudgetAccountKind, VarianceSection> = {
    income: { kind: "income", rows: [], totals: [] },
    expense: { kind: "expense", rows: [], totals: [] },
  };
  const budgetTotals: Record<BudgetAccountKind, bigint[]> = {
    income: input.columns.map(() => 0n),
    expense: input.columns.map(() => 0n),
  };
  const actualTotals: Record<BudgetAccountKind, bigint[]> = {
    income: input.columns.map(() => 0n),
    expense: input.columns.map(() => 0n),
  };

  const ordered = [...input.accounts].sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true }),
  );
  for (const account of ordered) {
    let touched = false;
    const cells = input.columns.map((col, ci) => {
      let budget = 0n;
      let actual = 0n;
      for (const month of col.months) {
        const k = key(account.id, month);
        budget += budgetBy.get(k) ?? 0n;
        const posted = activityBy.get(k);
        if (posted) {
          actual += account.kind === "income" ? posted.c - posted.d : posted.d - posted.c;
        }
      }
      if (budget !== 0n || actual !== 0n) touched = true;
      budgetTotals[account.kind][ci] = (budgetTotals[account.kind][ci] ?? 0n) + budget;
      actualTotals[account.kind][ci] = (actualTotals[account.kind][ci] ?? 0n) + actual;
      return cell(account.kind, budget, actual);
    });
    if (touched) {
      sections[account.kind].rows.push({
        accountId: account.id,
        code: account.code,
        name: account.name,
        cells,
      });
    }
  }

  for (const kind of ["income", "expense"] as const) {
    sections[kind].totals = input.columns.map((_, ci) =>
      cell(kind, budgetTotals[kind][ci] ?? 0n, actualTotals[kind][ci] ?? 0n),
    );
  }
  const net = input.columns.map((_, ci) => {
    const budget = (budgetTotals.income[ci] ?? 0n) - (budgetTotals.expense[ci] ?? 0n);
    const actual = (actualTotals.income[ci] ?? 0n) - (actualTotals.expense[ci] ?? 0n);
    return cell("income", budget, actual);
  });
  return {
    columns: input.columns.map((column) => ({ key: column.key, label: column.label })),
    income: sections.income,
    expense: sections.expense,
    net,
  };
}
