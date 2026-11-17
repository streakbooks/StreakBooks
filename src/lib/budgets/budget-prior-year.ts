/**
 * Validate previous-year posted actuals before replacing the budget editor grid.
 * The prior-year ledger can contain income/expense accounts that have since
 * been archived. Never silently discard those amounts when copying a budget.
 */
import { MAX_BUDGET_CELL_MINOR } from "@/lib/budgets/budget-document";

export type PriorYearActualRow = {
  accountId: string;
  accountCode?: string;
  accountName?: string;
  months: readonly number[];
};

export function preparePriorYearActualsDraft(
  editableAccountIds: readonly string[],
  actuals: readonly PriorYearActualRow[],
): Record<string, number[]> {
  const editable = new Set(editableAccountIds);
  if (editable.size !== editableAccountIds.length) {
    throw new Error("The editable chart of accounts contains duplicate IDs.");
  }
  const seen = new Set<string>();
  const unavailable: string[] = [];
  const draft: Record<string, number[]> = Object.create(null) as Record<string, number[]>;

  for (const row of actuals) {
    if (!row.accountId || seen.has(row.accountId)) {
      throw new Error("Prior-year actuals contain a missing or duplicated account.");
    }
    seen.add(row.accountId);
    if (!Array.isArray(row.months) || row.months.length !== 12) {
      throw new Error("Prior-year actuals must cover exactly twelve fiscal months.");
    }
    for (const amount of row.months) {
      if (!Number.isSafeInteger(amount) || Math.abs(amount) > MAX_BUDGET_CELL_MINOR) {
        throw new Error(
          "Prior-year actuals contain amounts outside the supported budget cell range.",
        );
      }
    }
    if (!editable.has(row.accountId)) {
      const label = [row.accountCode, row.accountName].filter(Boolean).join(" · ");
      unavailable.push(label || row.accountId);
      continue;
    }
    draft[row.accountId] = [...row.months];
  }

  if (unavailable.length > 0) {
    const examples = unavailable.slice(0, 3).join(", ");
    throw new Error(
      `Copy blocked: ${unavailable.length} historical account(s) are no longer editable (${examples}). ` +
        "Reactivate or remap these accounts before copying. No prior-year amounts were applied.",
    );
  }
  return draft;
}
