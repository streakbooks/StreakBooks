import { parsePaymentTermsDays } from "./workflow-defaults-validation";

type Errors = Record<string, string>;

export type SalesDefaultsDraft = {
  terms: string;
  quoteDays: string;
  notes: string;
  instructions: string;
  inclusive: boolean;
};

export type PurchasesDefaultsDraft = {
  terms: string;
  notes: string;
  requirePo: boolean;
};

/** Parse form input before invoking the shared workflow server endpoint. */
export function parseSalesDefaultsDraft(draft: SalesDefaultsDraft) {
  const errors: Errors = {};
  const terms = parsePaymentTermsDays(draft.terms);
  const quoteText = draft.quoteDays.trim();
  const quoteValue = /^\d+$/.test(quoteText) ? Number(quoteText) : NaN;
  const quoteDays =
    Number.isSafeInteger(quoteValue) && quoteValue >= 1 && quoteValue <= 365 ? quoteValue : null;
  if (terms === null) errors["terms"] = "Enter whole days between 0 and 3650.";
  if (quoteDays === null) errors["quoteDays"] = "Enter whole days between 1 and 365.";
  if (draft.notes.length > 2000) errors["notes"] = "Use at most 2,000 characters.";
  if (draft.instructions.length > 2000) errors["instructions"] = "Use at most 2,000 characters.";
  if (Object.keys(errors).length > 0 || terms === null || quoteDays === null) {
    return { ok: false as const, errors };
  }
  return {
    ok: true as const,
    errors: {},
    value: {
      salesDefaultPaymentTermsDays: terms,
      salesQuoteValidityDays: quoteDays,
      salesDefaultNotes: draft.notes,
      salesPaymentInstructions: draft.instructions,
      salesPricesIncludeTax: draft.inclusive,
    },
  };
}

export function parsePurchasesDefaultsDraft(draft: PurchasesDefaultsDraft) {
  const errors: Errors = {};
  const terms = parsePaymentTermsDays(draft.terms);
  if (terms === null) errors["terms"] = "Enter whole days between 0 and 3650.";
  if (draft.notes.length > 2000) errors["notes"] = "Use at most 2,000 characters.";
  if (Object.keys(errors).length > 0 || terms === null) {
    return { ok: false as const, errors };
  }
  return {
    ok: true as const,
    errors: {},
    value: {
      purchasesDefaultPaymentTermsDays: terms,
      purchasesDefaultNotes: draft.notes,
      purchasesRequirePo: draft.requirePo,
    },
  };
}
