/** Pure helpers for CRM pipeline admin validation (no I/O). */

export type PipelineStageDraft = {
  name: string;
  probabilityPct: number;
  sortOrder: number;
  isWon: boolean;
  isLost: boolean;
  isActive: boolean;
};

export function validatePipelineStageDraft(draft: PipelineStageDraft): string | null {
  const name = draft.name.trim();
  if (!name || name.length > 120) return "Stage name is required (1-120 characters)";
  if (draft.probabilityPct < 0 || draft.probabilityPct > 100) {
    return "Probability must be between 0 and 100";
  }
  if (draft.isWon && draft.isLost) return "Stage cannot be both won and lost";
  if (draft.sortOrder < 0 || draft.sortOrder > 100000) return "Sort order out of range";
  return null;
}

export function validatePipelineDraft(input: {
  name: string;
  sortOrder: number;
}): string | null {
  const name = input.name.trim();
  if (!name || name.length > 120) return "Pipeline name is required (1-120 characters)";
  if (input.sortOrder < 0 || input.sortOrder > 100000) return "Sort order out of range";
  return null;
}
