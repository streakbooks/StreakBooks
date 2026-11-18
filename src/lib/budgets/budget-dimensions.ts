/**
 * Planning allocations are independent breakdowns of the main budget.
 * Class, department and location categories may each allocate up to 100% of
 * an account/month; they must never be added across different categories.
 */
export type AllocationCell = {
  optionId: string;
  accountId: string;
  month: string;
  amountMinor: number;
};
export type BudgetCell = { accountId: string; month: string; amountMinor: number };

export function validateBudgetAllocations(input: {
  rows: readonly AllocationCell[];
  base: readonly BudgetCell[];
  months: readonly string[];
}): {
  rows: AllocationCell[];
  remaining: Map<string, number>;
} {
  if (input.months.length !== 12 || new Set(input.months).size !== 12)
    throw new Error("Twelve distinct fiscal months are required.");
  if (input.rows.length > 5000) throw new Error("Too many allocation cells.");
  const monthSet = new Set(input.months);
  const base = new Map<string, number>();
  for (const cell of input.base) {
    const key = `${cell.accountId}|${cell.month}`;
    if (base.has(key)) throw new Error("Duplicate main-budget account and month.");
    if (!Number.isSafeInteger(cell.amountMinor))
      throw new Error("Main budget amount exceeds the safe minor-unit range.");
    base.set(key, cell.amountMinor);
  }
  const allocated = new Map<string, number>();
  const seen = new Set<string>();
  const rows: AllocationCell[] = [];
  for (const row of input.rows) {
    if (!row.optionId || !row.accountId || !monthSet.has(row.month))
      throw new Error("Invalid class, account or financial month.");
    if (
      !Number.isSafeInteger(row.amountMinor) ||
      row.amountMinor < 0 ||
      row.amountMinor > 900_000_000_000_000
    )
      throw new Error("Allocations require nonnegative, safe minor-unit amounts.");
    const key = `${row.optionId}|${row.accountId}|${row.month}`;
    if (seen.has(key)) throw new Error("Duplicate option/account/month allocation.");
    seen.add(key);
    if (row.amountMinor === 0) continue;
    const baseKey = `${row.accountId}|${row.month}`;
    const sum = (allocated.get(baseKey) ?? 0) + row.amountMinor;
    if (!Number.isSafeInteger(sum))
      throw new Error("Allocation subtotal exceeds the safe minor-unit range.");
    allocated.set(baseKey, sum);
    rows.push(row);
  }
  const remaining = new Map<string, number>();
  for (const [key, amount] of allocated) {
    const ceiling = base.get(key) ?? 0;
    if (amount > ceiling)
      throw new Error("Allocations exceed the corresponding account/month budget.");
    remaining.set(key, ceiling - amount);
  }
  for (const [key, amount] of base) {
    if (!remaining.has(key)) remaining.set(key, amount);
  }
  return { rows, remaining };
}

export function allocationAnnualTotals(rows: readonly AllocationCell[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!Number.isSafeInteger(row.amountMinor))
      throw new Error("Allocation total contains an unsafe amount.");
    const key = `${row.optionId}|${row.accountId}`;
    const next = (totals.get(key) ?? 0) + row.amountMinor;
    if (!Number.isSafeInteger(next))
      throw new Error("Allocation total exceeds the supported range.");
    totals.set(key, next);
  }
  return totals;
}
