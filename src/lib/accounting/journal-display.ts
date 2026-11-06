import type { JournalSourceType } from "./posting-engine";

/** Keep the journal catalogue aligned with every supported posting source. */
export const JOURNAL_SOURCE_LABELS: Record<JournalSourceType, string> = {
  manual: "Manual journal",
  opening_balance: "Opening balance",
  sales_invoice: "Sales invoice",
  sales_credit_note: "Sales credit note",
  customer_payment: "Customer payment",
  purchase_bill: "Bill",
  purchase_credit_note: "Supplier credit",
  supplier_payment: "Supplier payment",
  expense: "Expense",
  bank_transaction: "Bank transaction",
  bank_transfer: "Bank transfer",
  tax_adjustment: "Tax adjustment",
  reversal: "Reversal",
  other: "Bank document",
  fx_revaluation: "FX revaluation",
  fx_realised: "Realised FX",
  depreciation: "Depreciation",
  asset_disposal: "Asset disposal",
  payroll: "Payroll",
};

/** A future/legacy source remains visible rather than silently disappearing. */
export function journalSourceLabel(sourceType: string): string {
  return Object.prototype.hasOwnProperty.call(JOURNAL_SOURCE_LABELS, sourceType)
    ? JOURNAL_SOURCE_LABELS[sourceType as JournalSourceType]
    : sourceType;
}

/**
 * Journal lines are stored in the journal currency; GL reporting separately
 * converts them to base currency using the journal's stored FX rate.
 */
export function journalLineCurrency(
  detailCurrency: string | null | undefined,
  listCurrency: string | null | undefined,
  baseCurrency: string,
): string {
  return detailCurrency?.trim() || listCurrency?.trim() || baseCurrency;
}
