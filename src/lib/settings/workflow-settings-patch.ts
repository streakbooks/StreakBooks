import type { WorkflowSettings } from "./workflow-settings.functions";

export type WorkflowSettingsUpdateInput = {
  salesDefaultPaymentTermsDays?: number | undefined;
  salesDefaultNotes?: string | null | undefined;
  salesPaymentInstructions?: string | null | undefined;
  salesQuoteValidityDays?: number | undefined;
  purchasesDefaultPaymentTermsDays?: number | undefined;
  purchasesDefaultNotes?: string | null | undefined;
  purchasesRequirePo?: boolean | undefined;
  bankingCsvDateFormat?: string | undefined;
  accountingRequireJournalMemo?: boolean | undefined;
};

/** Map only submitted settings so saving one module cannot overwrite another module's values. */
export function toWorkflowSettingsPatch(
  input: WorkflowSettingsUpdateInput,
): Partial<Omit<WorkflowSettings, "company_id">> {
  const patch: Partial<Omit<WorkflowSettings, "company_id">> = {};

  if (input.salesDefaultPaymentTermsDays !== undefined)
    patch.sales_default_payment_terms_days = input.salesDefaultPaymentTermsDays;
  if (input.salesDefaultNotes !== undefined) patch.sales_default_notes = input.salesDefaultNotes;
  if (input.salesPaymentInstructions !== undefined)
    patch.sales_payment_instructions = input.salesPaymentInstructions;
  if (input.salesQuoteValidityDays !== undefined)
    patch.sales_quote_validity_days = input.salesQuoteValidityDays;
  if (input.purchasesDefaultPaymentTermsDays !== undefined)
    patch.purchases_default_payment_terms_days = input.purchasesDefaultPaymentTermsDays;
  if (input.purchasesDefaultNotes !== undefined)
    patch.purchases_default_notes = input.purchasesDefaultNotes;
  if (input.purchasesRequirePo !== undefined) patch.purchases_require_po = input.purchasesRequirePo;
  if (input.bankingCsvDateFormat !== undefined)
    patch.banking_csv_date_format = input.bankingCsvDateFormat;
  if (input.accountingRequireJournalMemo !== undefined)
    patch.accounting_require_journal_memo = input.accountingRequireJournalMemo;

  return patch;
}
