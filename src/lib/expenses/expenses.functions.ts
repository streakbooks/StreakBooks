import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc, companyIdOf } from "@/lib/planning/rpc";
import {
  mapExpenseManagementSettings,
  toExpenseManagementSettingsPayload,
} from "@/lib/expenses/settings";
import type {
  ExpenseManagementSettings,
  ExpenseManagementSettingsInput,
} from "@/lib/expenses/types";

export const EXPENSE_MANAGEMENT_MIGRATION =
  "Expense Management is not available yet: the database update 20261107120000 has not been applied.";

export const getExpenseManagementSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<ExpenseManagementSettings> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<Record<string, unknown>>(
      context.supabase,
      "get_expense_management_settings",
      { _company_id: data.companyId },
      EXPENSE_MANAGEMENT_MIGRATION,
    );
    return mapExpenseManagementSettings(raw, data.companyId);
  });

export const saveExpenseManagementSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; draft: ExpenseManagementSettingsInput }) => ({
    companyId: companyIdOf(input),
    draft: input.draft,
  }))
  .handler(async ({ data, context }): Promise<ExpenseManagementSettings> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.manage_policies");
    if (
      data.draft.claimNumberPrefix !== undefined &&
      (data.draft.claimNumberPrefix.trim().length < 1 ||
        data.draft.claimNumberPrefix.trim().length > 12)
    ) {
      throw new Error("Claim number prefix must be 1–12 characters.");
    }
    if (
      data.draft.defaultClaimCurrency != null &&
      data.draft.defaultClaimCurrency !== "" &&
      !/^[A-Za-z]{3}$/.test(data.draft.defaultClaimCurrency)
    ) {
      throw new Error("Default claim currency must be a 3-letter ISO code.");
    }
    if (
      data.draft.requireReceiptAboveMinor !== undefined &&
      (!Number.isSafeInteger(data.draft.requireReceiptAboveMinor) ||
        data.draft.requireReceiptAboveMinor < 0)
    ) {
      throw new Error("Receipt threshold must be a whole number of minor units ≥ 0.");
    }

    const raw = await callRpc<Record<string, unknown>>(
      context.supabase,
      "save_expense_management_settings",
      {
        _company_id: data.companyId,
        _payload: toExpenseManagementSettingsPayload(data.draft),
      },
      EXPENSE_MANAGEMENT_MIGRATION,
    );
    return mapExpenseManagementSettings(raw, data.companyId);
  });
