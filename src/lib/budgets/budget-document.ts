/**
 * Validate the complete budget editor payload before making any database calls.
 * Integer minor-unit limits match save_budget_lines in PostgreSQL.
 */
export const MAX_BUDGET_CELL_MINOR = 900_000_000_000_000;
export const MAX_BUDGET_SAVE_ROWS = 1666; // 1666 * 12 = 19992; SQL caps at 20000

export type BudgetSaveRow = { accountId: string; months: number[] };

export function validateBudgetDocumentInput(input: {
  name: unknown;
  notes: unknown;
  expectedUpdatedAt: unknown;
  rows: unknown;
}): {
  name: string;
  notes: string | null;
  expectedUpdatedAt: string;
  rows: BudgetSaveRow[];
} {
  if (typeof input.name !== "string") throw new Error("Enter a budget name.");
  const name = input.name.trim();
  if (!name || name.length > 120) {
    throw new Error("Budget name must be between 1 and 120 characters.");
  }
  if (input.notes !== null && input.notes !== undefined && typeof input.notes !== "string") {
    throw new Error("Budget notes must be text.");
  }
  const notes = (input.notes ?? "") as string;
  if (notes.trim().length > 2000) throw new Error("Budget notes cannot exceed 2000 characters.");
  if (
    typeof input.expectedUpdatedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(input.expectedUpdatedAt) ||
    !Number.isFinite(Date.parse(input.expectedUpdatedAt))
  ) {
    throw new Error("An existing budget version is required. Reload and try again.");
  }
  if (!Array.isArray(input.rows) || input.rows.length > MAX_BUDGET_SAVE_ROWS) {
    throw new Error("Too many budget accounts to save in one operation.");
  }
  const seen = new Set<string>();
  const rows: BudgetSaveRow[] = input.rows.map((row: unknown) => {
    const r = row as { accountId?: unknown; months?: unknown } | null;
    if (typeof r?.accountId !== "string" || !r.accountId.trim()) {
      throw new Error("A budget row has an invalid account.");
    }
    if (seen.has(r.accountId)) throw new Error("A budget contains duplicate account rows.");
    seen.add(r.accountId);
    if (!Array.isArray(r.months) || r.months.length !== 12) {
      throw new Error("Each budget account must contain twelve monthly amounts.");
    }
    return {
      accountId: r.accountId,
      months: r.months.map((amount: unknown) => {
        if (
          typeof amount !== "number" ||
          !Number.isSafeInteger(amount) ||
          Math.abs(amount) > MAX_BUDGET_CELL_MINOR
        ) {
          throw new Error("Budget amounts must be whole minor units within the supported range.");
        }
        return amount;
      }),
    };
  });
  return {
    name,
    notes: notes.trim() || null,
    expectedUpdatedAt: input.expectedUpdatedAt,
    rows,
  };
}
