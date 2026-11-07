import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc, companyIdOf, isMissingRelation } from "@/lib/planning/rpc";
import {
  mapExpenseManagementSettings,
  toExpenseManagementSettingsPayload,
} from "@/lib/expenses/settings";
import {
  mapExpenseClaimDetail,
  mapExpenseClaimSummary,
  toExpenseClaimPayload,
  type ExpenseClaimDetail,
  type ExpenseClaimDraftInput,
  type ExpenseClaimSummary,
} from "@/lib/expenses/claims";
import { emptyExpenseOverviewKpis, type ExpenseOverviewResponse } from "@/lib/expenses/overview";
import {
  mapExpenseClaimTemplate,
  toExpenseClaimTemplatePayload,
  type ExpenseClaimTemplate,
} from "@/lib/expenses/templates";
import type {
  ExpenseManagementSettings,
  ExpenseManagementSettingsInput,
  ExpensePaymentSource,
} from "@/lib/expenses/types";

export const EXPENSE_MANAGEMENT_MIGRATION =
  "Expense Management is not available yet: the database update 20261107120000 has not been applied.";

export const EXPENSE_CLAIM_MIGRATION =
  "Expense claim workflows are not available yet: apply database updates 20261107120000 and 20261107123000.";

export const EXPENSE_TEMPLATE_MIGRATION =
  "Expense claim templates are not available yet: apply database update 20261107130000.";

type CountResult = {
  count: number | null;
  error: { message: string; code?: string } | null;
};

type FilterBuilder = {
  eq: (column: string, value: string) => FilterBuilder;
  in: (column: string, values: string[]) => FilterBuilder;
  then: PromiseLike<CountResult>["then"];
};

type CountClient = {
  from: (table: string) => {
    select: (columns: string, options: { count: "exact"; head: boolean }) => FilterBuilder;
  };
};

async function countRows(
  sb: CountClient,
  table: string,
  companyId: string,
  filters: Array<{ column: string; value: string } | { column: string; values: string[] }>,
): Promise<{ count: number; missing: boolean }> {
  let query: FilterBuilder = sb
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);
  for (const filter of filters) {
    query = "values" in filter ? query.in(filter.column, filter.values) : query.eq(filter.column, filter.value);
  }
  const result = await query;
  if (result.error) {
    if (isMissingRelation(result.error)) return { count: 0, missing: true };
    throw new Error(result.error.message);
  }
  return { count: result.count ?? 0, missing: false };
}

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

export const getExpenseManagementOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<ExpenseOverviewResponse> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const sb = context.supabase as unknown as CountClient;

    const [
      legacySubmitted,
      legacyReimbursed,
      legacyRejected,
      directDraft,
      directPosted,
      emTotal,
      emPending,
      emApproved,
      emAwaiting,
    ] = await Promise.all([
      countRows(sb, "employee_expense_claims", data.companyId, [
        { column: "status", value: "submitted" },
      ]),
      countRows(sb, "employee_expense_claims", data.companyId, [
        { column: "status", value: "reimbursed" },
      ]),
      countRows(sb, "employee_expense_claims", data.companyId, [
        { column: "status", value: "rejected" },
      ]),
      countRows(sb, "purchase_expenses", data.companyId, [{ column: "status", value: "draft" }]),
      countRows(sb, "purchase_expenses", data.companyId, [
        { column: "status", values: ["authorised", "paid", "partly_paid"] },
      ]),
      countRows(sb, "expense_claims", data.companyId, []),
      countRows(sb, "expense_claims", data.companyId, [
        { column: "approval_status", values: ["submitted", "in_review"] },
      ]),
      countRows(sb, "expense_claims", data.companyId, [
        { column: "approval_status", value: "approved" },
      ]),
      countRows(sb, "expense_claims", data.companyId, [
        {
          column: "reimbursement_status",
          values: ["eligible", "awaiting_payment", "payment_initiated"],
        },
      ]),
    ]);

    const foundationAvailable = !emTotal.missing;
    const kpis = emptyExpenseOverviewKpis(foundationAvailable);
    kpis.legacySubmittedClaims = legacySubmitted.count;
    kpis.legacyReimbursedClaims = legacyReimbursed.count;
    kpis.legacyRejectedClaims = legacyRejected.count;
    kpis.directExpensesDraft = directDraft.count;
    kpis.directExpensesPosted = directPosted.count;
    kpis.emClaimsTotal = emTotal.count;
    kpis.emPendingApproval = emPending.count;
    kpis.emApproved = emApproved.count;
    kpis.emAwaitingReimbursement = emAwaiting.count;

    return {
      companyId: data.companyId,
      kpis,
      migrationMessage: foundationAvailable ? null : EXPENSE_MANAGEMENT_MIGRATION,
    };
  });

export const listExpenseClaims = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; scope?: "own" | "all" }) => ({
    companyId: companyIdOf(input),
    scope: input.scope === "all" ? ("all" as const) : ("own" as const),
  }))
  .handler(async ({ data, context }): Promise<ExpenseClaimSummary[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<{ claims?: unknown[] }>(
      context.supabase,
      "list_expense_claims",
      { _company_id: data.companyId, _scope: data.scope },
      EXPENSE_CLAIM_MIGRATION,
    );
    return (raw.claims ?? []).map(mapExpenseClaimSummary);
  });

export const getExpenseClaim = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; claimId: string }) => ({
    companyId: companyIdOf(input),
    claimId: input.claimId,
  }))
  .handler(async ({ data, context }): Promise<ExpenseClaimDetail> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<unknown>(
      context.supabase,
      "get_expense_claim",
      { _company_id: data.companyId, _claim_id: data.claimId },
      EXPENSE_CLAIM_MIGRATION,
    );
    return mapExpenseClaimDetail(raw);
  });

export const saveExpenseClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; draft: ExpenseClaimDraftInput }) => ({
    companyId: companyIdOf(input),
    draft: input.draft,
  }))
  .handler(async ({ data, context }): Promise<ExpenseClaimDetail> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.submit");
    if (!data.draft.title.trim()) throw new Error("Claim title is required.");
    if (!data.draft.lines.length) throw new Error("Add at least one expense line.");
    const raw = await callRpc<unknown>(
      context.supabase,
      "save_expense_claim",
      { _company_id: data.companyId, _payload: toExpenseClaimPayload(data.draft) },
      EXPENSE_CLAIM_MIGRATION,
    );
    return mapExpenseClaimDetail(raw);
  });

export const submitExpenseClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; claimId: string; version: number }) => ({
    companyId: companyIdOf(input),
    claimId: input.claimId,
    version: input.version,
  }))
  .handler(async ({ data, context }): Promise<ExpenseClaimDetail> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.submit");
    const raw = await callRpc<unknown>(
      context.supabase,
      "submit_expense_claim",
      {
        _company_id: data.companyId,
        _claim_id: data.claimId,
        _expected_version: data.version,
      },
      EXPENSE_CLAIM_MIGRATION,
    );
    return mapExpenseClaimDetail(raw);
  });

export const withdrawExpenseClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; claimId: string; version: number }) => ({
    companyId: companyIdOf(input),
    claimId: input.claimId,
    version: input.version,
  }))
  .handler(async ({ data, context }): Promise<ExpenseClaimDetail> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.submit");
    const raw = await callRpc<unknown>(
      context.supabase,
      "withdraw_expense_claim",
      {
        _company_id: data.companyId,
        _claim_id: data.claimId,
        _expected_version: data.version,
      },
      EXPENSE_CLAIM_MIGRATION,
    );
    return mapExpenseClaimDetail(raw);
  });

export const deleteExpenseClaimDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; claimId: string; version: number }) => ({
    companyId: companyIdOf(input),
    claimId: input.claimId,
    version: input.version,
  }))
  .handler(async ({ data, context }): Promise<{ deleted: boolean; id: string }> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.submit");
    const raw = await callRpc<{ deleted?: boolean; id?: string }>(
      context.supabase,
      "delete_expense_claim_draft",
      {
        _company_id: data.companyId,
        _claim_id: data.claimId,
        _expected_version: data.version,
      },
      EXPENSE_CLAIM_MIGRATION,
    );
    return { deleted: Boolean(raw.deleted), id: String(raw.id ?? data.claimId) };
  });

export const duplicateExpenseClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; claimId: string }) => ({
    companyId: companyIdOf(input),
    claimId: input.claimId,
  }))
  .handler(async ({ data, context }): Promise<ExpenseClaimDetail> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.submit");
    const raw = await callRpc<unknown>(
      context.supabase,
      "duplicate_expense_claim",
      { _company_id: data.companyId, _claim_id: data.claimId },
      EXPENSE_TEMPLATE_MIGRATION,
    );
    return mapExpenseClaimDetail(raw);
  });

export const listExpenseClaimTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<ExpenseClaimTemplate[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<{ templates?: unknown[] }>(
      context.supabase,
      "list_expense_claim_templates",
      { _company_id: data.companyId },
      EXPENSE_TEMPLATE_MIGRATION,
    );
    return (raw.templates ?? []).map(mapExpenseClaimTemplate);
  });

export const saveExpenseClaimTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      draft: {
        id?: string;
        name: string;
        titleTemplate?: string;
        descriptionTemplate?: string | null;
        claimCurrency?: string | null;
        paymentSource?: ExpensePaymentSource;
        defaultLines: ExpenseClaimDraftInput["lines"];
      };
    }) => ({
      companyId: companyIdOf(input),
      draft: input.draft,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseClaimTemplate> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.submit");
    if (!data.draft.name.trim()) throw new Error("Template name is required.");
    const raw = await callRpc<unknown>(
      context.supabase,
      "save_expense_claim_template",
      {
        _company_id: data.companyId,
        _payload: toExpenseClaimTemplatePayload(data.draft),
      },
      EXPENSE_TEMPLATE_MIGRATION,
    );
    return mapExpenseClaimTemplate(raw);
  });
