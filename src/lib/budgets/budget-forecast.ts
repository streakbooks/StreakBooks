/**
 * LinkBooks Budgets: deterministic accrual forecast.
 * Actuals are posted base-currency amounts, financial months are complete only.
 * Future months use adjusted budget OR the trailing up-to-three-completed-month run rate.
 * No journal records, base budgets, approvals or allocations are changed.
 */
import { roundDiv, type BudgetAccountKind } from "@/lib/budgets/budget-math";

export type ForecastMethod = "budget" | "run_rate";
export type ForecastAssumptions = {
  method: ForecastMethod;
  incomeBps: number;
  expenseBps: number;
};
export type ForecastAccount = {
  id: string;
  code: string;
  name: string;
  kind: BudgetAccountKind;
};
export type ForecastAmount = {
  accountId: string;
  month: string;
  amountMinor: number;
};
export type ForecastActivity = {
  accountId: string;
  month: string;
  debitMinor: number;
  creditMinor: number;
};
export type ForecastPeriod = {
  month: string;
  budgetMinor: number;
  actualMinor: number | null;
  forecastMinor: number;
  source: "actual" | "adjusted_budget" | "run_rate" | "no_actual_history";
};
export type ForecastRow = {
  accountId: string;
  code: string;
  name: string;
  kind: BudgetAccountKind;
  months: ForecastPeriod[];
  baselineMinor: number;
  projectedMinor: number;
  differenceMinor: number;
};
export type ForecastTotals = {
  budgetMinor: number;
  projectedMinor: number;
  varianceMinor: number;
};
export type ForecastResult = {
  months: string[];
  completedThrough: string | null;
  completedMonths: number;
  projectedMonths: number;
  accounts: ForecastRow[];
  totals: {
    income: ForecastTotals;
    expense: ForecastTotals;
    net: ForecastTotals;
  };
  noHistoryCells: number;
  method: ForecastMethod;
  incomeBps: number;
  expenseBps: number;
};
export const FORECAST_PRESETS = {
  conservative: { method: "budget", incomeBps: -1000, expenseBps: 1000 },
  base: { method: "budget", incomeBps: 0, expenseBps: 0 },
  optimistic: { method: "budget", incomeBps: 1000, expenseBps: -500 },
} as const satisfies Record<string, ForecastAssumptions>;

const MAX_CELL = 900_000_000_000_000n;
function amount(value: number, label: string): bigint {
  if (!Number.isSafeInteger(value) || BigInt(value) < -MAX_CELL || BigInt(value) > MAX_CELL) {
    throw new Error(label + " must be safe integer minor units within the forecast limit.");
  }
  return BigInt(value);
}
function checked(value: bigint, label: string): number {
  if (value < -BigInt(Number.MAX_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(label + " exceeds the supported minor-unit range.");
  }
  return Number(value);
}
export function validateForecastAssumptions(value: unknown): ForecastAssumptions {
  if (!value || typeof value !== "object") throw new Error("Forecast assumptions are required.");
  const x = value as Record<string, unknown>;
  if (x["method"] !== "budget" && x["method"] !== "run_rate") {
    throw new Error("Choose a valid forecast method.");
  }
  for (const key of ["incomeBps", "expenseBps"] as const) {
    const bps = x[key];
    if (typeof bps !== "number" || !Number.isInteger(bps) || bps < -10000 || bps > 50000) {
      throw new Error(key + " must be between -100% and +500% in whole basis points.");
    }
  }
  return {
    method: x["method"] as ForecastMethod,
    incomeBps: x["incomeBps"] as number,
    expenseBps: x["expenseBps"] as number,
  };
}
function key(accountId: string, month: string): string {
  return accountId + "|" + month;
}
function totals(rows: ForecastRow[], kind: BudgetAccountKind): ForecastTotals {
  let budget = 0n,
    projected = 0n;
  for (const row of rows) {
    if (row.kind !== kind) continue;
    budget += BigInt(row.baselineMinor);
    projected += BigInt(row.projectedMinor);
  }
  return {
    budgetMinor: checked(budget, kind + " total budget"),
    projectedMinor: checked(projected, kind + " projected total"),
    // Favourable: higher income, lower expenses.
    varianceMinor: checked(kind === "income" ? projected - budget : budget - projected, "Variance"),
  };
}

export function buildBudgetForecast(input: {
  months: readonly string[];
  accounts: readonly ForecastAccount[];
  budget: readonly ForecastAmount[];
  actuals: readonly ForecastActivity[];
  /** Index of last FULLY completed month; -1 means none. */
  completedIndex: number;
  assumptions: ForecastAssumptions;
}): ForecastResult {
  const assumptions = validateForecastAssumptions(input.assumptions);
  if (input.months.length !== 12 || new Set(input.months).size !== 12) {
    throw new Error("Forecast requires twelve distinct fiscal months.");
  }
  if (
    !Number.isInteger(input.completedIndex) ||
    input.completedIndex < -1 ||
    input.completedIndex >= 12
  ) {
    throw new Error("Completed month index must be between -1 and 11.");
  }
  const monthOf = new Map(input.months.map((m, i) => [m, i]));
  const accounts = new Map(input.accounts.map((a) => [a.id, a]));
  if (accounts.size !== input.accounts.length) throw new Error("Duplicate forecast accounts.");
  const budget = new Map<string, bigint>();
  for (const row of input.budget) {
    if (!accounts.has(row.accountId) || !monthOf.has(row.month)) {
      throw new Error("Budget includes a missing account or invalid fiscal month.");
    }
    const id = key(row.accountId, row.month);
    if (budget.has(id)) throw new Error("Duplicate budget account/month.");
    budget.set(id, amount(row.amountMinor, "Budget"));
  }
  const actuals = new Map<string, bigint>();
  for (const row of input.actuals) {
    const idx = monthOf.get(row.month);
    if (idx === undefined || idx > input.completedIndex) continue;
    const acct = accounts.get(row.accountId);
    if (!acct) throw new Error("Actuals include an unknown account.");
    const id = key(row.accountId, row.month);
    const debit = amount(row.debitMinor, "Debit");
    const credit = amount(row.creditMinor, "Credit");
    const natural = acct.kind === "income" ? credit - debit : debit - credit;
    const updated = (actuals.get(id) ?? 0n) + natural;
    checked(updated, "Actual subtotal");
    actuals.set(id, updated);
  }

  let noHistoryCells = 0;
  const output: ForecastRow[] = input.accounts
    .map((acct) => {
      const periods: ForecastPeriod[] = [];
      const adjustment = acct.kind === "income" ? assumptions.incomeBps : assumptions.expenseBps;
      let baseline = 0n;
      let projected = 0n;
      for (let i = 0; i < 12; i++) {
        const month = input.months[i]!;
        const b = budget.get(key(acct.id, month)) ?? 0n;
        baseline += b;
        let forecast: bigint;
        let source: ForecastPeriod["source"];
        let actualMinor: number | null = null;
        if (i <= input.completedIndex) {
          forecast = actuals.get(key(acct.id, month)) ?? 0n;
          actualMinor = checked(forecast, "Recorded actual");
          source = "actual";
        } else {
          let reference = b;
          source = "adjusted_budget";
          if (assumptions.method === "run_rate") {
            if (input.completedIndex < 0) {
              source = "no_actual_history";
              noHistoryCells++;
            } else {
              const first = Math.max(0, input.completedIndex - 2);
              let historical = 0n;
              for (let j = first; j <= input.completedIndex; j++) {
                historical += actuals.get(key(acct.id, input.months[j]!)) ?? 0n;
              }
              reference = roundDiv(historical, BigInt(input.completedIndex - first + 1));
              source = "run_rate";
            }
          }
          forecast = roundDiv(reference * BigInt(10000 + adjustment), 10000n);
        }
        projected += forecast;
        periods.push({
          month,
          budgetMinor: checked(b, "Budget month"),
          actualMinor,
          forecastMinor: checked(forecast, "Forecast month"),
          source,
        });
      }
      return {
        accountId: acct.id,
        code: acct.code,
        name: acct.name,
        kind: acct.kind,
        months: periods,
        baselineMinor: checked(baseline, "Account budget year"),
        projectedMinor: checked(projected, "Account forecast year"),
        differenceMinor: checked(projected - baseline, "Account projected difference"),
      };
    })
    .filter(
      (row) =>
        row.baselineMinor !== 0 ||
        row.projectedMinor !== 0 ||
        row.months.some(
          (m) => m.budgetMinor !== 0 || (m.actualMinor !== null && m.actualMinor !== 0),
        ),
    );

  output.sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) ||
      a.code.localeCompare(b.code, undefined, { numeric: true }) ||
      a.name.localeCompare(b.name),
  );
  const income = totals(output, "income");
  const expense = totals(output, "expense");
  const netBudget = BigInt(income.budgetMinor) - BigInt(expense.budgetMinor);
  const netProjected = BigInt(income.projectedMinor) - BigInt(expense.projectedMinor);
  return {
    months: [...input.months],
    completedThrough: input.completedIndex >= 0 ? input.months[input.completedIndex]! : null,
    completedMonths: input.completedIndex + 1,
    projectedMonths: 11 - input.completedIndex,
    accounts: output,
    totals: {
      income,
      expense,
      net: {
        budgetMinor: checked(netBudget, "Net budget"),
        projectedMinor: checked(netProjected, "Net projection"),
        varianceMinor: checked(netProjected - netBudget, "Net forecast variance"),
      },
    },
    noHistoryCells,
    ...assumptions,
  };
}
