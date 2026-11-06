/**
 * Budget arithmetic (pure). All money is integer minor units; percentages are integer basis points.
 * A budget covers one fiscal year as 12 monthly amounts per income / expense account.
 */

import { addMonthsIso, monthStart } from "@/lib/accounting/fiscal-year";

export type BudgetAccountKind = "income" | "expense";

/** Convert only exact minor-unit integers; reject overflow before Number conversion. */
export function checkedBudgetMinor(value: bigint, label: string): number {
  if (value < BigInt(Number.MIN_SAFE_INTEGER) ||
      value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(label + " exceeds the supported safe minor-unit range.");
  }
  return Number(value);
}

function asBudgetMinor(value: number, label: string): bigint {
  if (!Number.isSafeInteger(value)) {
    throw new Error(label + " must be a safe integer in minor units.");
  }
  return BigInt(value);
}

/** First month of the following fiscal year; month based so leap years cannot shift the start. */
export function nextBudgetYearStart(fiscalYearStart: string): string {
  return addMonthsIso(monthStart(fiscalYearStart), 12);
}

/** Month starts (YYYY-MM-01) of the twelve months of the fiscal year beginning at `fyStart`. */
export function fiscalMonthStarts(fyStart: string, count = 12): string[] {
  const first = monthStart(fyStart);
  return Array.from({ length: count }, (_, i) => addMonthsIso(first, i));
}

/** Round half away from zero for a non-negative divisor, using integer maths only. */
export function roundDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("Divisor must be positive");
  const neg = numerator < 0n;
  const abs = neg ? -numerator : numerator;
  const q = (abs * 2n + denominator) / (denominator * 2n);
  return neg ? -q : q;
}

/** Apply an uplift in basis points (1000 = +10%, -500 = -5%) to an amount; rounds half away from zero. */
export function applyUpliftBps(minor: number, bps: number): number {
  if (!Number.isSafeInteger(minor)) throw new Error("Amount must be a safe integer in minor units");
  if (!Number.isSafeInteger(bps)) throw new Error("Uplift must be safe whole basis points");
  const result = roundDiv(BigInt(minor) * (10_000n + BigInt(bps)), 10_000n);
  return checkedBudgetMinor(result, "Adjusted budget amount");
}

/** Copy the value at `fromIndex` into every later month ("fill right"). */
export function fillRight(row: readonly number[], fromIndex: number): number[] {
  if (fromIndex < 0 || fromIndex >= row.length) return [...row];
  const v = row[fromIndex] ?? 0;
  return row.map((x, i) => (i > fromIndex ? v : x));
}

/**
 * Distribute an annual total across months without introducing opposite-sign
 * months for small amounts. Start with a quotient rounded toward zero and
 * distribute the remaining minor units one by one to the final months.
 * Every month differs by at most one minor unit; the annual total is exact.
 */
export function spreadEvenly(total: number, months = 12): number[] {
  if (!Number.isSafeInteger(total)) throw new Error("Amount must be a safe integer in minor units");
  if (!Number.isSafeInteger(months) || months < 0 || months > 1200) {
    throw new Error("Month count must be a nonnegative safe integer at most 1200.");
  }
  if (months === 0) return [];
  const count = BigInt(months);
  const each = BigInt(total) / count;
  const remainder = BigInt(total) % count;
  const out = Array.from({ length: months }, () => checkedBudgetMinor(each, "Monthly spread"));
  const extra = Number(remainder < 0n ? -remainder : remainder);
  const step = remainder < 0n ? -1n : 1n;
  for (let i = months - extra; i < months; i++) {
    out[i] = checkedBudgetMinor(each + step, "Monthly spread remainder");
  }
  return out;
}

export function sumMinorNumbers(values: readonly number[]): number {
  return checkedBudgetMinor(
    values.reduce<bigint>((total, value) => total + asBudgetMinor(value, "Budget amount"), 0n),
    "Budget sum",
  );
}

/** Natural actual for an account kind from base-currency debit/credit totals. */
export function naturalActual(kind: BudgetAccountKind, debit: number, credit: number): number {
  const d = asBudgetMinor(debit, "Posted debit");
  const c = asBudgetMinor(credit, "Posted credit");
  return checkedBudgetMinor(kind === "income" ? c - d : d - c, "Natural actual");
}

export type VarianceStatus = "favourable" | "unfavourable" | "on_budget";

export type Variance = {
  /** Favourable is positive: income actual − budget, expense budget − actual. */
  varianceMinor: number;
  /** Variance as basis points of the budget magnitude; null when the budget is zero. */
  variancePctBps: number | null;
  status: VarianceStatus;
};

export function computeVariance(kind: BudgetAccountKind, budget: number, actual: number): Variance {
  const b = asBudgetMinor(budget, "Budget");
  const a = asBudgetMinor(actual, "Actual");
  const difference = kind === "income" ? a - b : b - a;
  const varianceMinor = checkedBudgetMinor(difference, "Budget variance");
  const base = b < 0n ? -b : b;
  const variancePctBps = base === 0n ? null :
    checkedBudgetMinor(roundDiv(difference * 10_000n, base), "Budget variance percentage");
  const status: VarianceStatus =
    difference > 0n ? "favourable" : difference < 0n ? "unfavourable" : "on_budget";
  return { varianceMinor, variancePctBps, status };
}

export type ReportView = "month" | "quarter" | "ytd";

export type BudgetColumn = { key: string; label: string; months: string[] };

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function monthLabel(monthStartIso: string): string {
  const m = Number(monthStartIso.slice(5, 7));
  return `${MONTH_NAMES[m - 1] ?? "?"} ${monthStartIso.slice(2, 4)}`;
}

/**
 * Columns for Budget vs Actual. `months` are the 12 fiscal month starts; `throughMonth` (any date)
 * is the last month compared. Later months are never shown: no actuals exist yet, so a variance
 * would mislead. Every view ends with a "Year to date" total column.
 */
export function buildBudgetColumns(
  view: ReportView,
  months: readonly string[],
  throughMonth: string,
): BudgetColumn[] {
  const limit = monthStart(throughMonth);
  const elapsed = months.filter((m) => m <= limit);
  if (elapsed.length === 0) return [];
  const ytd: BudgetColumn = { key: "ytd", label: "Year to date", months: elapsed };
  if (view === "ytd") {
    const last = elapsed[elapsed.length - 1]!;
    return [{ key: "current", label: monthLabel(last), months: [last] }, ytd];
  }
  if (view === "quarter") {
    const cols: BudgetColumn[] = [];
    for (let q = 0; q * 3 < months.length; q++) {
      const inQuarter = months.slice(q * 3, q * 3 + 3).filter((m) => m <= limit);
      if (inQuarter.length > 0) {
        cols.push({ key: `q${q + 1}`, label: `Q${q + 1}`, months: inQuarter });
      }
    }
    return [...cols, ytd];
  }
  return [...elapsed.map((m) => ({ key: m, label: monthLabel(m), months: [m] })), ytd];
}
