/** Validate legacy settings forms before invoking a server action. */
export type DocumentSequenceDraft = {
  prefix: string;
  next: string;
  padding: string;
};

export function validateDocumentSequenceDraft(draft: DocumentSequenceDraft) {
  const prefix = draft.prefix.trim();
  const nextText = draft.next.trim();
  const paddingText = draft.padding.trim();
  const next = Number(nextText);
  const padding = Number(paddingText);
  const errors: Record<string, string> = {};

  if (prefix.length > 20) errors["prefix"] = "Prefix must be 20 characters or fewer.";
  if (!/^\d+$/.test(nextText) || !Number.isSafeInteger(next) || next < 1) {
    errors["next"] = "Next number must be a positive whole number.";
  }
  if (!/^\d+$/.test(paddingText) || !Number.isInteger(padding) || padding < 1 || padding > 10) {
    errors["padding"] = "Padding must be a whole number from 1 to 10.";
  }

  if (Object.keys(errors).length > 0) return { ok: false as const, errors };
  return { ok: true as const, value: { prefix, next_number: next, padding }, errors };
}

export function isValidThemeColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value.trim());
}

export function isValidPositiveFxRate(value: string): boolean {
  if (!value.trim()) return false;
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

export function isValidOptionalEmail(value: string): boolean {
  const trimmed = value.trim();
  return !trimmed || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}
