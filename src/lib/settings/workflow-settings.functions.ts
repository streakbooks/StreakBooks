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
import { toWorkflowSettingsPatch } from "@/lib/settings/workflow-settings-patch";

export type WorkflowSettings = {
  company_id: string;
  sales_default_payment_terms_days: number;
  sales_default_notes: string | null;
  sales_payment_instructions: string | null;
  sales_quote_validity_days: number;
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
  purchases_default_payment_terms_days: 30,
  purchases_default_notes: null,
  purchases_require_po: false,
  banking_csv_date_format: "YYYY-MM-DD",
  accounting_require_journal_memo: false,
};

export const getWorkflowSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({
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
  .validator(
    (input: {
      companyId: string;
      salesDefaultPaymentTermsDays?: number;
      salesDefaultNotes?: string;
      salesPaymentInstructions?: string;
      salesQuoteValidityDays?: number;
      purchasesDefaultPaymentTermsDays?: number;
      purchasesDefaultNotes?: string;
      purchasesRequirePo?: boolean;
      bankingCsvDateFormat?: string;
      accountingRequireJournalMemo?: boolean;
    }) => ({
      companyId: assertUuid(input.companyId),
      salesDefaultPaymentTermsDays:
        input.salesDefaultPaymentTermsDays === undefined
          ? undefined
          : parseWorkflowWholeDays(input.salesDefaultPaymentTermsDays, 30, 0, 3650),
      salesDefaultNotes:
        input.salesDefaultNotes === undefined
          ? undefined
          : parseWorkflowText(input.salesDefaultNotes),
      salesPaymentInstructions:
        input.salesPaymentInstructions === undefined
          ? undefined
          : parseWorkflowText(input.salesPaymentInstructions),
      salesQuoteValidityDays:
        input.salesQuoteValidityDays === undefined
          ? undefined
          : parseWorkflowWholeDays(input.salesQuoteValidityDays, 30, 1, 365),
      purchasesDefaultPaymentTermsDays:
        input.purchasesDefaultPaymentTermsDays === undefined
          ? undefined
          : parseWorkflowWholeDays(input.purchasesDefaultPaymentTermsDays, 30, 0, 3650),
      purchasesDefaultNotes:
        input.purchasesDefaultNotes === undefined
          ? undefined
          : parseWorkflowText(input.purchasesDefaultNotes),
      purchasesRequirePo:
        input.purchasesRequirePo === undefined
          ? undefined
          : parseWorkflowBoolean(input.purchasesRequirePo, false),
      bankingCsvDateFormat:
        input.bankingCsvDateFormat === undefined
          ? undefined
          : parseWorkflowCsvDateFormat(input.bankingCsvDateFormat),
      accountingRequireJournalMemo:
        input.accountingRequireJournalMemo === undefined
          ? undefined
          : parseWorkflowBoolean(input.accountingRequireJournalMemo, false),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "company.settings.edit");
    const changes = toWorkflowSettingsPatch(data);
    if (Object.keys(changes).length === 0)
      throw new Error("Provide at least one setting to update.");
    const audit = {
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    };

    const { data: updated, error: updateError } = await context.supabase
      .from("company_workflow_settings" as never)
      .update({ ...changes, ...audit } as never)
      .eq("company_id" as never, data.companyId as never)
      .select("company_id" as never)
      .maybeSingle();
    if (updateError) throw new Error(updateError.message);

    if (!updated) {
      const { error: insertError } = await context.supabase
        .from("company_workflow_settings" as never)
        .insert({ company_id: data.companyId, ...defaults, ...changes, ...audit } as never);
      if (insertError?.code === "23505") {
        // Another first save created the row. Retry only the requested columns.
        const { error: retryError } = await context.supabase
          .from("company_workflow_settings" as never)
          .update({ ...changes, ...audit } as never)
          .eq("company_id" as never, data.companyId as never);
        if (retryError) throw new Error(retryError.message);
      } else if (insertError) {
        throw new Error(insertError.message);
      }
    }

    return { ok: true };
  });
