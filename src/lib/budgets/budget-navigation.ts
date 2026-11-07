/** URL search state and safe return context for the Budgets list. */
export type BudgetListSearch = { q?: string };

export function parseBudgetListSearch(raw: Record<string, unknown>): BudgetListSearch {
  const q = raw["q"];
  return typeof q === "string" && q.length > 0 && q.length <= 100 ? { q } : {};
}

export function encodeBudgetListReturnContext(input: Record<string, unknown>): string {
  const search = parseBudgetListSearch(input);
  return search.q ? new URLSearchParams({ q: search.q }).toString() : "";
}

/** A budget return token can only contain allowlisted list filters, not redirect URLs. */
export function decodeBudgetListReturnContext(raw: unknown): BudgetListSearch {
  if (typeof raw !== "string" || !raw || raw.length > 512) return {};
  return parseBudgetListSearch(Object.fromEntries(new URLSearchParams(raw)));
}
