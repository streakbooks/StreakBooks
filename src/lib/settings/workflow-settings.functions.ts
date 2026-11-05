import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import {
  parseWorkflowBoolean,
  parseWorkflowCsvDateFormat,
  parseWorkflowText,
  parseWorkflowWholeDays,
} from "@/lib/settings/workflow-defaults-validation";

export type WorkflowSettings = {
  company_id: string;
  sales_default_payment_terms_days: number;
  sales_default_notes: string | null;
  sales_payment_instructions: string | null;
  sales_quote_validity_days: number;
  sales_prices_include_tax: boolean;
  purchases_default_payment_terms_days: number;
  purchases_default_notes: string | null;
  purchases_require_po: boolean;
  banking_csv_date_format: string;
  accounting_require_journal_memo: boolean;
};

const defaults: Omit<WorkflowSettings, "company_id"> = {
  sales_default_payment_terms_days: 30,
  sales_default_notes: null,
  sales_payment_instructions: null,
  sales_quote_validity_days: 30,
  sales_prices_include_tax: false,
  purchases_default_payment_terms_days: 30,
  purchases_default_notes: null,
  purchases_require_po: false,
  banking_csv_date_format: "YYYY-MM-DD",
  accounting_require_journal_memo: false,
};

export const getWorkflowSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: assertUuid(input.companyId),
  }))
  .handler(async ({ data, context }): Promise<WorkflowSettings> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: row, error } = await context.supabase
      .from("company_workflow_settings" as never)
      .select("*" as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) {
      return { company_id: data.companyId, ...defaults };
    }
    return row as WorkflowSettings;
  });

export const upsertWorkflowSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      salesDefaultPaymentTermsDays?: number;
      salesDefaultNotes?: string;
      salesPaymentInstructions?: string;
      salesQuoteValidityDays?: number;
      salesPricesIncludeTax?: boolean;
      purchasesDefaultPaymentTermsDays?: number;
      purchasesDefaultNotes?: string;
      purchasesRequirePo?: boolean;
      bankingCsvDateFormat?: string;
      accountingRequireJournalMemo?: boolean;
    }) => ({
      companyId: assertUuid(input.companyId),
      salesDefaultPaymentTermsDays: parseWorkflowWholeDays(
        input.salesDefaultPaymentTermsDays,
        30,
        0,
        3650,
      ),
      salesDefaultNotes: parseWorkflowText(input.salesDefaultNotes),
      salesPaymentInstructions: parseWorkflowText(input.salesPaymentInstructions),
      salesQuoteValidityDays: parseWorkflowWholeDays(input.salesQuoteValidityDays, 30, 1, 365),
      salesPricesIncludeTax: parseWorkflowBoolean(input.salesPricesIncludeTax, false),
      purchasesDefaultPaymentTermsDays: parseWorkflowWholeDays(
        input.purchasesDefaultPaymentTermsDays,
        30,
        0,
        3650,
      ),
      purchasesDefaultNotes: parseWorkflowText(input.purchasesDefaultNotes),
      purchasesRequirePo: parseWorkflowBoolean(input.purchasesRequirePo, false),
      bankingCsvDateFormat: parseWorkflowCsvDateFormat(input.bankingCsvDateFormat),
      accountingRequireJournalMemo: parseWorkflowBoolean(
        input.accountingRequireJournalMemo,
        false,
      ),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "company.settings.edit");
    const payload = {
      company_id: data.companyId,
      sales_default_payment_terms_days: data.salesDefaultPaymentTermsDays,
      sales_default_notes: data.salesDefaultNotes,
      sales_payment_instructions: data.salesPaymentInstructions,
      sales_quote_validity_days: data.salesQuoteValidityDays,
      sales_prices_include_tax: data.salesPricesIncludeTax,
      purchases_default_payment_terms_days: data.purchasesDefaultPaymentTermsDays,
      purchases_default_notes: data.purchasesDefaultNotes,
      purchases_require_po: data.purchasesRequirePo,
      banking_csv_date_format: data.bankingCsvDateFormat,
      accounting_require_journal_memo: data.accountingRequireJournalMemo,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    };
    const { error } = await context.supabase
      .from("company_workflow_settings" as never)
      .upsert(payload as never, { onConflict: "company_id" });
    if (error) throw new Error(error.message);

    // Keep posting tax treatment in sync with sales prices-include-tax setting.
    const { data: taxRow } = await context.supabase
      .from("company_tax_settings" as never)
      .select("company_id" as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (taxRow) {
      const { error: taxErr } = await context.supabase
        .from("company_tax_settings" as never)
        .update({
          prices_include_tax: data.salesPricesIncludeTax,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("company_id" as never, data.companyId as never);
      if (taxErr) console.warn("[workflow settings] tax sync:", taxErr.message);
    } else {
      const { error: taxErr } = await context.supabase
        .from("company_tax_settings" as never)
        .insert({
          company_id: data.companyId,
          prices_include_tax: data.salesPricesIncludeTax,
          tax_regime: "none",
        } as never);
      if (taxErr) console.warn("[workflow settings] tax insert:", taxErr.message);
    }
    return { ok: true };
  });
