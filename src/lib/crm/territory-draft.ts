/** Pure territory draft validation. */

export type CrmTerritoryDraft = {
  name: string;
  sortOrder: number;
};

export function validateCrmTerritoryDraft(draft: CrmTerritoryDraft): string | null {
  const name = draft.name.trim();
  if (!name || name.length > 120) return "Territory name is required (1-120 characters)";
  if (draft.sortOrder < 0 || draft.sortOrder > 100000) return "Sort order out of range";
  return null;
}
