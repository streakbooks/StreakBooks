/** URL search state and safe return context for the Budgets list. */
export type BudgetListSearch = { q?: string };

export function parseBudgetListSearch(raw: Record<string, unknown>): BudgetListSearch {
  const q = raw["q"];
  if (typeof q !== "string") return {};
  const normalized = q.trim();
  // Reject invisible controls in URL-restored search, while allowing Unicode text.
  if (!normalized || normalized.length > 100 || /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/u.test(normalized)) return {};
  return { q: normalized };
}

export function encodeBudgetListReturnContext(input: Record<string, unknown>): string {
  const search = parseBudgetListSearch(input);
  return search.q ? new URLSearchParams({ q: search.q }).toString() : "";
}

/** A budget return token can only contain allowlisted list filters, not redirect URLs. */
export function decodeBudgetListReturnContext(raw: unknown): BudgetListSearch {
  if (typeof raw !== "string" || !raw || raw.length > 512) return {};
  const params = new URLSearchParams(raw);
  // Ambiguous duplicate search keys must not silently use the last value.
  if (params.getAll("q").length > 1) return {};
  return parseBudgetListSearch({ q: params.get("q") });
}
