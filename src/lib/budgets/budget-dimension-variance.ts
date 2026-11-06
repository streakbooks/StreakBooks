/**
 * Accrual dimension budget-vs-actual, sourced only from POSTED journal lines.
 * Budget allocations are independent by category and are not added to other categories.
 * Unassigned journal-line activity is disclosed separately, not attributed to options.
 */
import { roundDiv, type BudgetAccountKind, type VarianceStatus } from "@/lib/budgets/budget-math";
import { isYearEndCloseLine } from "@/lib/accounting/reporting";
import { addDaysIso, addMonthsIso, monthStart } from "@/lib/accounting/fiscal-year";

/**
 * Align dimension actuals with the core P&L/ledger monthly activity reporting
 * policy. A recognised year-end closing journal is posted for balance carry-over,
 * not economic income/expense activity. Never classify it as a tracking actual.
 *
 * Keep the full posted-line object for subsequent FX-safe debit/credit aggregation.
 */
export function eligibleDimensionActualLines<T extends {
  source_type?: string;
  memo?: string | null;
}>(postedLines: readonly T[]): T[] {
  return postedLines.filter((line) => !isYearEndCloseLine(line));
}

/**
 * Query only category assignments for journal lines actually included in this
 * posted-ledger report. Bounded 100-UUID batches avoid oversized PostgREST URLs.
 * Identity problems fail closed; never silently drop an actual journal line.
 */
export function batchPostedLineIds(
  lines: readonly { line_id?: string }[],
  batchSize = 100,
): string[][] {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new Error("Tracking lookup batch size must be between 1 and 100.");
  }
  const unique = new Set<string>();
  for (const line of lines) {
    if (!line.line_id) throw new Error("Posted journal line identity is missing.");
    unique.add(line.line_id);
  }
  const ids = [...unique];
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    batches.push(ids.slice(i, i + batchSize));
  }
  return batches;
}


/** Default to fully completed months; explicit as-of may include partial current month. */
export function resolveDimensionActualCutoff(
  fiscalStart: string,
  today: string,
  requestedThrough?: string,
): { through: string; partialMonth: boolean } {
  const start = monthStart(fiscalStart);
  const fiscalEnd = addDaysIso(addMonthsIso(start, 12), -1);
  const lastCompleted = addDaysIso(monthStart(today), -1);
  const through = [requestedThrough ?? lastCompleted, today, fiscalEnd].sort()[0]!;
  return {
    through,
    partialMonth: through >= start && through === today && through >= monthStart(today),
  };
}

export type DimensionActualAccount = {
  id: string;
  code: string;
  name: string;
  kind: BudgetAccountKind;
};
export type DimensionActualOption = { id: string; name: string; code: string | null };
export type DimensionPostedActivity = {
  lineId: string;
  optionId: string | null;
  accountId: string;
  month: string;
  debitMinor: number;
  creditMinor: number;
};
export type DimensionBudgetAmount = {
  optionId: string;
  accountId: string;
  month: string;
  amountMinor: number;
};
export type DimensionVarianceCell = {
  budgetMinor: number;
  actualMinor: number;
  varianceMinor: number;
  variancePctBps: number | null;
  status: VarianceStatus;
};
export type DimensionVarianceRow = {
  optionId: string | null;
  accountId: string;
  accountCode: string;
  accountName: string;
  kind: BudgetAccountKind;
  months: DimensionVarianceCell[];
  ytd: DimensionVarianceCell;
};
export type DimensionOptionSummary = {
  optionId: string | null;
  optionName: string;
  income: { months: DimensionVarianceCell[]; ytd: DimensionVarianceCell };
  expense: { months: DimensionVarianceCell[]; ytd: DimensionVarianceCell };
  net: { months: DimensionVarianceCell[]; ytd: DimensionVarianceCell };
};
export type DimensionVarianceReport = {
  months: string[];
  rows: DimensionVarianceRow[];
  summaries: DimensionOptionSummary[];
  assignedLines: number;
  unassignedLines: number;
};

function safe(value: bigint, label: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`${label} exceeds safe minor-unit range.`);
  return result;
}
function value(value: number, label: string): bigint {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be safe integer minor units.`);
  return BigInt(value);
}
function variance(kind: BudgetAccountKind, b: bigint, a: bigint): DimensionVarianceCell {
  const d = kind === "income" ? a - b : b - a;
  const base = b < 0n ? -b : b;
  const bps = base === 0n ? null : safe(roundDiv(d * 10000n, base), "Variance percentage");
  const status: VarianceStatus =
    d > 0n ? "favourable" : d < 0n ? "unfavourable" : "on_budget";
  return {
    budgetMinor: safe(b, "Budget"),
    actualMinor: safe(a, "Actual"),
    varianceMinor: safe(d, "Variance"),
    variancePctBps: bps,
    status,
  };
}
type Pair = { budget: bigint; actual: bigint };
function emptyPairs(length: number): Pair[] {
  return Array.from({ length }, () => ({ budget: 0n, actual: 0n }));
}
const UNASSIGNED = "__unassigned__";

export function buildDimensionVariance(input: {
  months: readonly string[];
  accounts: readonly DimensionActualAccount[];
  options: readonly DimensionActualOption[];
  budget: readonly DimensionBudgetAmount[];
  actual: readonly DimensionPostedActivity[];
}): DimensionVarianceReport {
  if (new Set(input.months).size !== input.months.length)
    throw new Error("Duplicate financial months in report.");
  const monthPosition = new Map(input.months.map((m, i) => [m, i]));
  const accountById = new Map(input.accounts.map((a) => [a.id, a]));
  const optionById = new Map(input.options.map((o) => [o.id, o]));
  if (accountById.size !== input.accounts.length || optionById.size !== input.options.length)
    throw new Error("Duplicate account or option identity.");
  const buckets = new Map<string, Pair[]>();
  const pairFor = (optionId: string, accountId: string): Pair[] => {
    const key = `${optionId}|${accountId}`;
    let pairs = buckets.get(key);
    if (!pairs) {
      pairs = emptyPairs(input.months.length);
      buckets.set(key, pairs);
    }
    return pairs;
  };
  const budgetSeen = new Set<string>();
  for (const b of input.budget) {
    const index = monthPosition.get(b.month);
    if (index === undefined) continue;
    if (!optionById.has(b.optionId) || !accountById.has(b.accountId))
      throw new Error("Budget amount references an unavailable dimension/account.");
    const key = `${b.optionId}|${b.accountId}|${b.month}`;
    if (budgetSeen.has(key)) throw new Error("Duplicate dimension budget cell.");
    budgetSeen.add(key);
    pairFor(b.optionId, b.accountId)[index]!.budget =
      value(b.amountMinor, "Dimension budget");
  }

  const seenLines = new Set<string>();
  let assignedLines = 0;
  let unassignedLines = 0;
  for (const a of input.actual) {
    const index = monthPosition.get(a.month);
    if (index === undefined) continue;
    if (seenLines.has(a.lineId)) throw new Error("Posted journal line counted twice.");
    seenLines.add(a.lineId);
    if (!accountById.has(a.accountId)) throw new Error("Posted account unavailable.");
    const assigned = a.optionId !== null && optionById.has(a.optionId);
    if (assigned) assignedLines++;
    else unassignedLines++;
    const key = assigned ? a.optionId! : UNASSIGNED;
    const account = accountById.get(a.accountId)!;
    const natural =
      account.kind === "income"
        ? value(a.creditMinor, "Posted credit") - value(a.debitMinor, "Posted debit")
        : value(a.debitMinor, "Posted debit") - value(a.creditMinor, "Posted credit");
    pairFor(key, a.accountId)[index]!.actual += natural;
  }

  const rows: DimensionVarianceRow[] = [];
  for (const [key, pairs] of buckets) {
    const separator = key.indexOf("|");
    const optionKey = key.slice(0, separator);
    const accountId = key.slice(separator + 1);
    const account = accountById.get(accountId)!;
    const months = pairs.map((p) => variance(account.kind, p.budget, p.actual));
    rows.push({
      optionId: optionKey === UNASSIGNED ? null : optionKey,
      accountId,
      accountCode: account.code,
      accountName: account.name,
      kind: account.kind,
      months,
      ytd: variance(
        account.kind,
        pairs.reduce((v, p) => v + p.budget, 0n),
        pairs.reduce((v, p) => v + p.actual, 0n),
      ),
    });
  }
  rows.sort((a, b) =>
    (a.optionId ?? "").localeCompare(b.optionId ?? "") ||
    a.accountCode.localeCompare(b.accountCode, undefined, { numeric: true }) ||
    a.accountName.localeCompare(b.accountName),
  );

  const optionsInReport = new Set(rows.map((r) => r.optionId ?? UNASSIGNED));
  const summaries: DimensionOptionSummary[] = [];
  for (const optionKey of optionsInReport) {
    const optionRows = rows.filter((r) => (r.optionId ?? UNASSIGNED) === optionKey);
    const section = (kind: BudgetAccountKind) => {
      const group = optionRows.filter((r) => r.kind === kind);
      const months = input.months.map((_, index) => variance(
        kind,
        group.reduce((v, r) => v + BigInt(r.months[index]!.budgetMinor), 0n),
        group.reduce((v, r) => v + BigInt(r.months[index]!.actualMinor), 0n),
      ));
      return {
        months,
        ytd: variance(
          kind,
          group.reduce((v, r) => v + BigInt(r.ytd.budgetMinor), 0n),
          group.reduce((v, r) => v + BigInt(r.ytd.actualMinor), 0n),
        ),
      };
    };
    const income = section("income");
    const expense = section("expense");
    const netCell = (a: DimensionVarianceCell, b: DimensionVarianceCell) =>
      variance("income",
        BigInt(a.budgetMinor) - BigInt(b.budgetMinor),
        BigInt(a.actualMinor) - BigInt(b.actualMinor),
      );
    summaries.push({
      optionId: optionKey === UNASSIGNED ? null : optionKey,
      optionName: optionKey === UNASSIGNED
        ? "Unassigned posted activity" : optionById.get(optionKey)?.name ?? "Unknown option",
      income,
      expense,
      net: {
        months: income.months.map((c, i) => netCell(c, expense.months[i]!)),
        ytd: netCell(income.ytd, expense.ytd),
      },
    });
  }
  summaries.sort((a, b) =>
    (a.optionId === null ? 1 : 0) - (b.optionId === null ? 1 : 0) ||
    a.optionName.localeCompare(b.optionName),
  );
  return { months: [...input.months], rows, summaries, assignedLines, unassignedLines };
}
