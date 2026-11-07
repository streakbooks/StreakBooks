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
import {
  mapExpenseSpendingRequest,
  toExpenseSpendingRequestPayload,
  type ExpenseSpendingRequestDraftInput,
  type ExpenseSpendingRequestSummary,
} from "@/lib/expenses/spending-requests";
import type {
  ExpenseManagementSettings,
  ExpenseManagementSettingsInput,
  ExpensePaymentSource,
} from "@/lib/expenses/types";
import {
  mapExpenseMileageRate,
  toExpenseMileageRatePayload,
  type ExpenseMileageRate,
} from "@/lib/expenses/mileage";
import {
  mapExpenseCashAdvance,
  toExpenseCashAdvancePayload,
  type ExpenseCashAdvance,
  type ExpenseCashAdvanceDraftInput,
} from "@/lib/expenses/cash-advances";
import {
  mapBatchReimburseResult,
  type BatchReimburseResult,
} from "@/lib/expenses/reimbursement";
import {
  mapExpenseApprovalDelegation,
  type ExpenseApprovalDelegation,
} from "@/lib/expenses/delegation";
import {
  mapExpenseApprovalEscalationList,
  mapExpenseApprovalEscalationRefresh,
  type ExpenseApprovalEscalationList,
  type ExpenseApprovalEscalationRefresh,
} from "@/lib/expenses/escalation";
import {
  mapExpensePettyCashFloat,
  toExpensePettyCashFloatPayload,
  type ExpensePettyCashFloat,
  type ExpensePettyCashFloatDraftInput,
} from "@/lib/expenses/petty-cash";
import {
  mapExpensePerDiemRate,
  toExpensePerDiemRatePayload,
  type ExpensePerDiemRate,
} from "@/lib/expenses/travel";
import {
  mapExpenseCorporateCard,
  mapExpenseCorporateCardTransaction,
  toExpenseCorporateCardPayload,
  toExpenseCorporateCardTxPayload,
  type ExpenseCorporateCard,
  type ExpenseCorporateCardDraftInput,
  type ExpenseCorporateCardTransaction,
} from "@/lib/expenses/corporate-cards";
import {
  mapExpenseExitOutstanding,
  mapExpenseExitSettlement,
  type ExpenseExitOutstanding,
  type ExpenseExitSettlement,
} from "@/lib/expenses/exit-settlement";
import {
  mapExpenseCategorySuggestion,
  mapExpenseClaimDuplicates,
  mapExpenseClaimRiskScan,
  type ExpenseCategorySuggestion,
  type ExpenseClaimDuplicateMatch,
  type ExpenseClaimRiskScan,
} from "@/lib/expenses/risk";
import {
  mapExpenseClaimAuditEvents,
  mapExpenseClaimExportRows,
  mapExpenseManagementReport,
  type ExpenseClaimAuditEvent,
  type ExpenseClaimExportRow,
  type ExpenseManagementReport,
} from "@/lib/expenses/reports";
import {
  mapLegacyExpenseMigrationPreview,
  mapLegacyExpenseMigrationResult,
  type LegacyExpenseMigrationPreview,
  type LegacyExpenseMigrationResult,
} from "@/lib/expenses/legacy-migration";

export const EXPENSE_MANAGEMENT_MIGRATION =
  "Expense Management is not available yet: the database update 20261107120000 has not been applied.";

export const EXPENSE_CLAIM_MIGRATION =
  "Expense claim workflows are not available yet: apply database updates 20261107120000 and 20261107123000.";

export const EXPENSE_APPROVAL_MIGRATION =
  "Expense claim approvals are not available yet: apply database update 20261107135000.";

export const EXPENSE_SPENDING_REQUEST_MIGRATION =
  "Expense spending requests are not available yet: apply database update 20261107136000.";

export const EXPENSE_POSTING_MIGRATION =
  "Expense claim posting is not available yet: apply database update 20261107137000.";

export const EXPENSE_REIMBURSEMENT_MIGRATION =
  "Expense claim reimbursement is not available yet: apply database update 20261107138000.";

export const EXPENSE_BATCH_REIMBURSE_MIGRATION =
  "Batch expense reimbursement is not available yet: apply database update 20261107149000.";

export const EXPENSE_DELEGATION_MIGRATION =
  "Expense approval delegation is not available yet: apply database update 20261107150000.";

export const EXPENSE_ESCALATION_MIGRATION =
  "Expense approval escalation is not available yet: apply database update 20261107151000.";

export const EXPENSE_MILEAGE_MIGRATION =
  "Expense mileage rates are not available yet: apply database update 20261107139000.";

export const EXPENSE_CASH_ADVANCE_MIGRATION =
  "Expense cash advances are not available yet: apply database update 20261107140000.";

export const EXPENSE_PETTY_CASH_MIGRATION =
  "Expense petty cash is not available yet: apply database update 20261107141000.";

export const EXPENSE_TRAVEL_MIGRATION =
  "Expense travel / per diem is not available yet: apply database update 20261107142000.";

export const EXPENSE_CORPORATE_CARD_MIGRATION =
  "Expense corporate cards are not available yet: apply database update 20261107143000.";

export const EXPENSE_DISPUTES_REBILLING_MIGRATION =
  "Expense card disputes and rebilling are not available yet: apply database update 20261107144000.";

export const EXPENSE_EXIT_SETTLEMENT_MIGRATION =
  "Expense exit settlement is not available yet: apply database update 20261107145000.";

export const EXPENSE_RISK_MIGRATION =
  "Expense risk and duplicate checks are not available yet: apply database update 20261107146000.";

export const EXPENSE_REPORTS_MIGRATION =
  "Expense reports are not available yet: apply database update 20261107147000.";

export const EXPENSE_NOTIFICATIONS_MIGRATION =
  "Expense notifications and legacy import are not available yet: apply database update 20261107148000.";

export const EXPENSE_TEMPLATE_MIGRATION =
  "Expense claim templates are not available yet: apply database update 20261107130000.";

export const EXPENSE_RECEIPT_MIGRATION =
  "Expense receipt inbox is not available yet: apply database updates 20261107133000 and 20261107134000.";

export type ExpenseReceiptInboxEntry = {
  id: string;
  fileName: string;
  source: string;
  status: string;
  contentType: string | null;
  sizeBytes: number | null;
  attachmentId: string | null;
  matchedClaimId: string | null;
  ocrStatus: string;
  createdAt: string;
};

export type ExpenseReceiptInboxResponse = {
  entries: ExpenseReceiptInboxEntry[];
  inboundEmailEnabled: boolean;
  ocrEnabled: boolean;
  note: string;
};

export type ExpenseCategory = {
  id: string;
  code: string;
  name: string;
};

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

    // Probe EM foundation once. When migrations are not applied, skip the three extra
    // expense_claims counts that would otherwise each hit a missing-relation failure.
    const [
      legacySubmitted,
      legacyReimbursed,
      legacyRejected,
      directDraft,
      directPosted,
      emTotal,
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
    ]);

    const foundationAvailable = !emTotal.missing;
    let emPendingCount = 0;
    let emApprovedCount = 0;
    let emAwaitingCount = 0;
    if (foundationAvailable) {
      const [emPending, emApproved, emAwaiting] = await Promise.all([
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
      emPendingCount = emPending.count;
      emApprovedCount = emApproved.count;
      emAwaitingCount = emAwaiting.count;
    }

    const kpis = emptyExpenseOverviewKpis(foundationAvailable);
    kpis.legacySubmittedClaims = legacySubmitted.count;
    kpis.legacyReimbursedClaims = legacyReimbursed.count;
    kpis.legacyRejectedClaims = legacyRejected.count;
    kpis.directExpensesDraft = directDraft.count;
    kpis.directExpensesPosted = directPosted.count;
    kpis.emClaimsTotal = emTotal.count;
    kpis.emPendingApproval = emPendingCount;
    kpis.emApproved = emApprovedCount;
    kpis.emAwaitingReimbursement = emAwaitingCount;

    return {
      companyId: data.companyId,
      kpis,
      migrationMessage: foundationAvailable ? null : EXPENSE_MANAGEMENT_MIGRATION,
    };
  });

export const listExpenseClaims = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      scope?: "own" | "all";
      approvalStatuses?: string[];
    }) => ({
      companyId: companyIdOf(input),
      scope: input.scope === "all" ? ("all" as const) : ("own" as const),
      approvalStatuses: Array.isArray(input.approvalStatuses)
        ? input.approvalStatuses.filter((status) => typeof status === "string" && status.trim())
        : undefined,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseClaimSummary[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<{ claims?: unknown[] }>(
      context.supabase,
      "list_expense_claims",
      {
        _company_id: data.companyId,
        _scope: data.scope,
        _approval_statuses: data.approvalStatuses ?? null,
      },
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

export const startExpenseClaimReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; claimId: string; version: number }) => ({
    companyId: companyIdOf(input),
    claimId: input.claimId,
    version: input.version,
  }))
  .handler(async ({ data, context }): Promise<ExpenseClaimDetail> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.approve");
    const raw = await callRpc<unknown>(
      context.supabase,
      "start_expense_claim_review",
      {
        _company_id: data.companyId,
        _claim_id: data.claimId,
        _expected_version: data.version,
      },
      EXPENSE_APPROVAL_MIGRATION,
    );
    return mapExpenseClaimDetail(raw);
  });

export const approveExpenseClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; claimId: string; version: number; note?: string }) => ({
      companyId: companyIdOf(input),
      claimId: input.claimId,
      version: input.version,
      note: input.note,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseClaimDetail> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.approve");
    const raw = await callRpc<unknown>(
      context.supabase,
      "approve_expense_claim",
      {
        _company_id: data.companyId,
        _claim_id: data.claimId,
        _expected_version: data.version,
        _note: data.note ?? null,
      },
      EXPENSE_APPROVAL_MIGRATION,
    );
    return mapExpenseClaimDetail(raw);
  });

export const returnExpenseClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; claimId: string; version: number; note: string }) => ({
      companyId: companyIdOf(input),
      claimId: input.claimId,
      version: input.version,
      note: input.note,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseClaimDetail> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.approve");
    if (!data.note.trim()) throw new Error("A return reason is required.");
    const raw = await callRpc<unknown>(
      context.supabase,
      "return_expense_claim",
      {
        _company_id: data.companyId,
        _claim_id: data.claimId,
        _expected_version: data.version,
        _note: data.note.trim(),
      },
      EXPENSE_APPROVAL_MIGRATION,
    );
    return mapExpenseClaimDetail(raw);
  });

export const rejectExpenseClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; claimId: string; version: number; note: string }) => ({
      companyId: companyIdOf(input),
      claimId: input.claimId,
      version: input.version,
      note: input.note,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseClaimDetail> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.approve");
    if (!data.note.trim()) throw new Error("A rejection reason is required.");
    const raw = await callRpc<unknown>(
      context.supabase,
      "reject_expense_claim",
      {
        _company_id: data.companyId,
        _claim_id: data.claimId,
        _expected_version: data.version,
        _note: data.note.trim(),
      },
      EXPENSE_APPROVAL_MIGRATION,
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

function mapReceiptInboxEntry(row: unknown): ExpenseReceiptInboxEntry {
  const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
  return {
    id: String(r["id"] ?? ""),
    fileName: String(r["file_name"] ?? r["fileName"] ?? ""),
    source: String(r["source"] ?? "upload"),
    status: String(r["status"] ?? "unassigned"),
    contentType: (r["content_type"] ?? r["contentType"] ?? null) as string | null,
    sizeBytes:
      typeof r["size_bytes"] === "number"
        ? r["size_bytes"]
        : typeof r["sizeBytes"] === "number"
          ? (r["sizeBytes"] as number)
          : null,
    attachmentId: (r["attachment_id"] ?? r["attachmentId"] ?? null) as string | null,
    matchedClaimId: (r["matched_claim_id"] ?? r["matchedClaimId"] ?? null) as string | null,
    ocrStatus: String(r["ocr_status"] ?? r["ocrStatus"] ?? "not_configured"),
    createdAt: String(r["created_at"] ?? r["createdAt"] ?? ""),
  };
}

export const listExpenseReceiptInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<ExpenseReceiptInboxResponse> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<{
      entries?: unknown[];
      inbound_email_enabled?: boolean;
      ocr_enabled?: boolean;
      note?: string;
    }>(
      context.supabase,
      "list_expense_receipt_inbox",
      { _company_id: data.companyId },
      EXPENSE_RECEIPT_MIGRATION,
    );
    return {
      entries: (raw.entries ?? []).map(mapReceiptInboxEntry),
      inboundEmailEnabled: Boolean(raw.inbound_email_enabled),
      ocrEnabled: Boolean(raw.ocr_enabled),
      note:
        raw.note ??
        "Inbound email and OCR are not configured. Upload files here, then match them to a draft claim.",
    };
  });

export const registerExpenseReceiptInboxEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      fileName: string;
      source?: "upload" | "email" | "mobile" | "import";
      contentType?: string;
      sizeBytes?: number;
      notes?: string;
    }) => ({
      companyId: companyIdOf(input),
      fileName: input.fileName,
      source: input.source ?? "upload",
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      notes: input.notes,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseReceiptInboxEntry> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.submit");
    if (!data.fileName.trim()) throw new Error("File name is required.");
    const raw = await callRpc<unknown>(
      context.supabase,
      "register_expense_receipt_inbox_entry",
      {
        _company_id: data.companyId,
        _payload: {
          file_name: data.fileName.trim(),
          source: data.source,
          content_type: data.contentType ?? null,
          size_bytes: data.sizeBytes ?? null,
          notes: data.notes ?? null,
        },
      },
      EXPENSE_RECEIPT_MIGRATION,
    );
    return mapReceiptInboxEntry(raw);
  });

export const finalizeExpenseReceiptInboxUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; entryId: string; attachmentId: string }) => ({
    companyId: companyIdOf(input),
    entryId: input.entryId,
    attachmentId: input.attachmentId,
  }))
  .handler(async ({ data, context }): Promise<ExpenseReceiptInboxEntry> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.submit");
    const raw = await callRpc<unknown>(
      context.supabase,
      "finalize_expense_receipt_inbox_upload",
      {
        _company_id: data.companyId,
        _entry_id: data.entryId,
        _attachment_id: data.attachmentId,
      },
      EXPENSE_RECEIPT_MIGRATION,
    );
    return mapReceiptInboxEntry(raw);
  });

export const matchExpenseReceiptToClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; entryId: string; claimId: string; claimLineId?: string }) => ({
      companyId: companyIdOf(input),
      entryId: input.entryId,
      claimId: input.claimId,
      claimLineId: input.claimLineId,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseReceiptInboxEntry> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.submit");
    const raw = await callRpc<unknown>(
      context.supabase,
      "match_expense_receipt_to_claim",
      {
        _company_id: data.companyId,
        _entry_id: data.entryId,
        _claim_id: data.claimId,
        _claim_line_id: data.claimLineId ?? null,
      },
      EXPENSE_RECEIPT_MIGRATION,
    );
    return mapReceiptInboxEntry(raw);
  });

export const dismissExpenseReceiptInboxEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; entryId: string }) => ({
    companyId: companyIdOf(input),
    entryId: input.entryId,
  }))
  .handler(async ({ data, context }): Promise<ExpenseReceiptInboxEntry> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.submit");
    const raw = await callRpc<unknown>(
      context.supabase,
      "dismiss_expense_receipt_inbox_entry",
      {
        _company_id: data.companyId,
        _entry_id: data.entryId,
      },
      EXPENSE_RECEIPT_MIGRATION,
    );
    return mapReceiptInboxEntry(raw);
  });

export const listExpenseSpendingRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; scope?: "own" | "all" }) => ({
    companyId: companyIdOf(input),
    scope: input.scope === "all" ? ("all" as const) : ("own" as const),
  }))
  .handler(async ({ data, context }): Promise<ExpenseSpendingRequestSummary[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<{ requests?: unknown[] }>(
      context.supabase,
      "list_expense_spending_requests",
      { _company_id: data.companyId, _scope: data.scope },
      EXPENSE_SPENDING_REQUEST_MIGRATION,
    );
    return (raw.requests ?? []).map(mapExpenseSpendingRequest);
  });

export const saveExpenseSpendingRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; draft: ExpenseSpendingRequestDraftInput }) => ({
      companyId: companyIdOf(input),
      draft: input.draft,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseSpendingRequestSummary> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.submit");
    if (!data.draft.title.trim()) throw new Error("Request title is required.");
    if (!(data.draft.amountMinor > 0)) throw new Error("Amount must be greater than zero.");
    const raw = await callRpc<unknown>(
      context.supabase,
      "save_expense_spending_request",
      {
        _company_id: data.companyId,
        _payload: toExpenseSpendingRequestPayload(data.draft),
      },
      EXPENSE_SPENDING_REQUEST_MIGRATION,
    );
    return mapExpenseSpendingRequest(raw);
  });

export const submitExpenseSpendingRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; requestId: string; version: number }) => ({
    companyId: companyIdOf(input),
    requestId: input.requestId,
    version: input.version,
  }))
  .handler(async ({ data, context }): Promise<ExpenseSpendingRequestSummary> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.submit");
    const raw = await callRpc<unknown>(
      context.supabase,
      "submit_expense_spending_request",
      {
        _company_id: data.companyId,
        _request_id: data.requestId,
        _expected_version: data.version,
      },
      EXPENSE_SPENDING_REQUEST_MIGRATION,
    );
    return mapExpenseSpendingRequest(raw);
  });

export const cancelExpenseSpendingRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; requestId: string; version: number }) => ({
    companyId: companyIdOf(input),
    requestId: input.requestId,
    version: input.version,
  }))
  .handler(async ({ data, context }): Promise<ExpenseSpendingRequestSummary> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.submit");
    const raw = await callRpc<unknown>(
      context.supabase,
      "cancel_expense_spending_request",
      {
        _company_id: data.companyId,
        _request_id: data.requestId,
        _expected_version: data.version,
      },
      EXPENSE_SPENDING_REQUEST_MIGRATION,
    );
    return mapExpenseSpendingRequest(raw);
  });

export const decideExpenseSpendingRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      requestId: string;
      version: number;
      decision: "approved" | "returned" | "rejected";
      note?: string;
    }) => ({
      companyId: companyIdOf(input),
      requestId: input.requestId,
      version: input.version,
      decision: input.decision,
      note: input.note,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseSpendingRequestSummary> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.approve");
    if (
      (data.decision === "returned" || data.decision === "rejected") &&
      !(data.note ?? "").trim()
    ) {
      throw new Error("A decision reason is required.");
    }
    const raw = await callRpc<unknown>(
      context.supabase,
      "decide_expense_spending_request",
      {
        _company_id: data.companyId,
        _request_id: data.requestId,
        _expected_version: data.version,
        _decision: data.decision,
        _note: data.note ?? null,
      },
      EXPENSE_SPENDING_REQUEST_MIGRATION,
    );
    return mapExpenseSpendingRequest(raw);
  });

export const linkExpenseClaimSpendingRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      claimId: string;
      version: number;
      spendingRequestId: string | null;
    }) => ({
      companyId: companyIdOf(input),
      claimId: input.claimId,
      version: input.version,
      spendingRequestId: input.spendingRequestId,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseClaimDetail> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.submit");
    const raw = await callRpc<unknown>(
      context.supabase,
      "link_expense_claim_spending_request",
      {
        _company_id: data.companyId,
        _claim_id: data.claimId,
        _expected_version: data.version,
        _spending_request_id: data.spendingRequestId,
      },
      EXPENSE_SPENDING_REQUEST_MIGRATION,
    );
    return mapExpenseClaimDetail(raw);
  });

export const postExpenseClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; claimId: string; version: number }) => ({
    companyId: companyIdOf(input),
    claimId: input.claimId,
    version: input.version,
  }))
  .handler(async ({ data, context }): Promise<ExpenseClaimDetail> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.post");
    const raw = await callRpc<unknown>(
      context.supabase,
      "post_expense_claim",
      {
        _company_id: data.companyId,
        _claim_id: data.claimId,
        _expected_version: data.version,
      },
      EXPENSE_POSTING_MIGRATION,
    );
    return mapExpenseClaimDetail(raw);
  });

export const reimburseExpenseClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      claimId: string;
      version: number;
      bankAccountId: string;
      paymentDate?: string;
    }) => ({
      companyId: companyIdOf(input),
      claimId: input.claimId,
      version: input.version,
      bankAccountId: input.bankAccountId,
      paymentDate: input.paymentDate,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseClaimDetail> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.reimburse");
    if (!data.bankAccountId) throw new Error("Choose a bank account for the reimbursement.");
    const raw = await callRpc<unknown>(
      context.supabase,
      "reimburse_expense_claim",
      {
        _company_id: data.companyId,
        _claim_id: data.claimId,
        _bank_account_id: data.bankAccountId,
        _expected_version: data.version,
        _payment_date: data.paymentDate ?? null,
      },
      EXPENSE_REIMBURSEMENT_MIGRATION,
    );
    return mapExpenseClaimDetail(raw);
  });

export const batchReimburseExpenseClaims = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      claimIds: string[];
      bankAccountId: string;
      paymentDate?: string;
    }) => ({
      companyId: companyIdOf(input),
      claimIds: input.claimIds,
      bankAccountId: input.bankAccountId,
      paymentDate: input.paymentDate,
    }),
  )
  .handler(async ({ data, context }): Promise<BatchReimburseResult> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.reimburse");
    if (!data.bankAccountId) throw new Error("Choose a bank account for the reimbursement.");
    if (!data.claimIds.length) throw new Error("Select at least one claim to reimburse.");
    const raw = await callRpc<unknown>(
      context.supabase,
      "batch_reimburse_expense_claims",
      {
        _company_id: data.companyId,
        _claim_ids: data.claimIds,
        _bank_account_id: data.bankAccountId,
        _payment_date: data.paymentDate ?? null,
      },
      EXPENSE_BATCH_REIMBURSE_MIGRATION,
    );
    return mapBatchReimburseResult(raw);
  });

export const listExpenseApprovalDelegations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: companyIdOf(input),
  }))
  .handler(async ({ data, context }): Promise<ExpenseApprovalDelegation[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<{ delegations?: unknown[] }>(
      context.supabase,
      "list_expense_approval_delegations",
      { _company_id: data.companyId },
      EXPENSE_DELEGATION_MIGRATION,
    );
    return (raw.delegations ?? []).map(mapExpenseApprovalDelegation);
  });

export const saveExpenseApprovalDelegation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      toUserId: string;
      startsOn: string;
      endsOn: string;
      note?: string;
    }) => ({
      companyId: companyIdOf(input),
      toUserId: input.toUserId,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      note: input.note,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseApprovalDelegation> => {
    await assertCompanyMember(context.supabase, data.companyId);
    if (!data.toUserId) throw new Error("Choose a delegate.");
    const raw = await callRpc<unknown>(
      context.supabase,
      "save_expense_approval_delegation",
      {
        _company_id: data.companyId,
        _to_user_id: data.toUserId,
        _starts_on: data.startsOn,
        _ends_on: data.endsOn,
        _note: data.note ?? null,
      },
      EXPENSE_DELEGATION_MIGRATION,
    );
    return mapExpenseApprovalDelegation(raw);
  });

export const revokeExpenseApprovalDelegation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; delegationId: string }) => ({
    companyId: companyIdOf(input),
    delegationId: input.delegationId,
  }))
  .handler(async ({ data, context }): Promise<ExpenseApprovalDelegation> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<unknown>(
      context.supabase,
      "revoke_expense_approval_delegation",
      {
        _company_id: data.companyId,
        _delegation_id: data.delegationId,
      },
      EXPENSE_DELEGATION_MIGRATION,
    );
    return mapExpenseApprovalDelegation(raw);
  });

export const listExpenseApprovalEscalations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: companyIdOf(input),
  }))
  .handler(async ({ data, context }): Promise<ExpenseApprovalEscalationList> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<unknown>(
      context.supabase,
      "list_expense_approval_escalations",
      { _company_id: data.companyId },
      EXPENSE_ESCALATION_MIGRATION,
    );
    return mapExpenseApprovalEscalationList(raw);
  });

export const refreshExpenseApprovalEscalations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: companyIdOf(input),
  }))
  .handler(async ({ data, context }): Promise<ExpenseApprovalEscalationRefresh> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<unknown>(
      context.supabase,
      "refresh_expense_approval_escalations",
      { _company_id: data.companyId },
      EXPENSE_ESCALATION_MIGRATION,
    );
    return mapExpenseApprovalEscalationRefresh(raw);
  });

export const saveExpenseApprovalEscalationDays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; days: number }) => ({
    companyId: companyIdOf(input),
    days: input.days,
  }))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ approvalEscalationDays: number; version: number }> => {
      await assertCompanyPermission(
        context.supabase,
        data.companyId,
        "expenses.manage_policies",
      );
      const raw = await callRpc<{
        approval_escalation_days?: number;
        version?: number;
      }>(
        context.supabase,
        "save_expense_approval_escalation_days",
        {
          _company_id: data.companyId,
          _days: data.days,
        },
        EXPENSE_ESCALATION_MIGRATION,
      );
      return {
        approvalEscalationDays: Number(raw.approval_escalation_days ?? data.days),
        version: Number(raw.version ?? 0),
      };
    },
  );

export const listExpenseMileageRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; activeOnly?: boolean }) => ({
      companyId: companyIdOf(input),
      activeOnly: input.activeOnly !== false,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseMileageRate[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<{ rates?: unknown[] }>(
      context.supabase,
      "list_expense_mileage_rates",
      { _company_id: data.companyId, _active_only: data.activeOnly },
      EXPENSE_MILEAGE_MIGRATION,
    );
    return (raw.rates ?? []).map(mapExpenseMileageRate);
  });

export const saveExpenseMileageRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      draft: {
        id?: string;
        name: string;
        vehicleClass?: string | null;
        distanceUnit: "km" | "mi";
        rateMinorPerUnit: number;
        currencyCode: string;
        accountId: string;
        effectiveFrom: string;
        effectiveTo?: string | null;
        isActive?: boolean;
      };
    }) => ({
      companyId: companyIdOf(input),
      draft: input.draft,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseMileageRate> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.admin");
    if (!data.draft.name.trim()) throw new Error("Mileage rate name is required.");
    if (!data.draft.accountId) throw new Error("Choose an expense account for the rate.");
    if (data.draft.rateMinorPerUnit <= 0) {
      throw new Error("Rate per unit must be greater than zero.");
    }
    const raw = await callRpc<unknown>(
      context.supabase,
      "save_expense_mileage_rate",
      {
        _company_id: data.companyId,
        _payload: toExpenseMileageRatePayload(data.draft),
      },
      EXPENSE_MILEAGE_MIGRATION,
    );
    return mapExpenseMileageRate(raw);
  });

export const listExpenseCashAdvances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; scope?: "own" | "all" }) => ({
    companyId: companyIdOf(input),
    scope: input.scope === "all" ? "all" : "own",
  }))
  .handler(async ({ data, context }): Promise<ExpenseCashAdvance[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<{ advances?: unknown[] }>(
      context.supabase,
      "list_expense_cash_advances",
      { _company_id: data.companyId, _scope: data.scope },
      EXPENSE_CASH_ADVANCE_MIGRATION,
    );
    return (raw.advances ?? []).map(mapExpenseCashAdvance);
  });

export const saveExpenseCashAdvance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; draft: ExpenseCashAdvanceDraftInput }) => ({
      companyId: companyIdOf(input),
      draft: input.draft,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseCashAdvance> => {
    await assertCompanyMember(context.supabase, data.companyId);
    if (!data.draft.title.trim()) throw new Error("Advance title is required.");
    if (data.draft.amountMinor <= 0) {
      throw new Error("Advance amount must be greater than zero.");
    }
    const raw = await callRpc<unknown>(
      context.supabase,
      "save_expense_cash_advance",
      {
        _company_id: data.companyId,
        _payload: toExpenseCashAdvancePayload(data.draft),
      },
      EXPENSE_CASH_ADVANCE_MIGRATION,
    );
    return mapExpenseCashAdvance(raw);
  });

export const issueExpenseCashAdvance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      advanceId: string;
      version: number;
      bankAccountId: string;
      issueDate?: string;
    }) => ({
      companyId: companyIdOf(input),
      advanceId: input.advanceId,
      version: input.version,
      bankAccountId: input.bankAccountId,
      issueDate: input.issueDate,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseCashAdvance> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.manage_advances");
    if (!data.bankAccountId) throw new Error("Choose a bank account to issue the advance.");
    const raw = await callRpc<unknown>(
      context.supabase,
      "issue_expense_cash_advance",
      {
        _company_id: data.companyId,
        _advance_id: data.advanceId,
        _bank_account_id: data.bankAccountId,
        _expected_version: data.version,
        _issue_date: data.issueDate ?? null,
      },
      EXPENSE_CASH_ADVANCE_MIGRATION,
    );
    return mapExpenseCashAdvance(raw);
  });

export const cancelExpenseCashAdvance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; advanceId: string; version: number }) => ({
      companyId: companyIdOf(input),
      advanceId: input.advanceId,
      version: input.version,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseCashAdvance> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<unknown>(
      context.supabase,
      "cancel_expense_cash_advance",
      {
        _company_id: data.companyId,
        _advance_id: data.advanceId,
        _expected_version: data.version,
      },
      EXPENSE_CASH_ADVANCE_MIGRATION,
    );
    return mapExpenseCashAdvance(raw);
  });

export const linkExpenseClaimCashAdvance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      claimId: string;
      version: number;
      advanceId: string;
    }) => ({
      companyId: companyIdOf(input),
      claimId: input.claimId,
      version: input.version,
      advanceId: input.advanceId,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseClaimDetail> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.submit");
    const raw = await callRpc<unknown>(
      context.supabase,
      "link_expense_claim_cash_advance",
      {
        _company_id: data.companyId,
        _claim_id: data.claimId,
        _expected_version: data.version,
        _advance_id: data.advanceId,
      },
      EXPENSE_CASH_ADVANCE_MIGRATION,
    );
    return mapExpenseClaimDetail(raw);
  });

export const listExpensePettyCashFloats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: companyIdOf(input),
  }))
  .handler(async ({ data, context }): Promise<ExpensePettyCashFloat[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<{ floats?: unknown[] }>(
      context.supabase,
      "list_expense_petty_cash_floats",
      { _company_id: data.companyId },
      EXPENSE_PETTY_CASH_MIGRATION,
    );
    return (raw.floats ?? []).map(mapExpensePettyCashFloat);
  });

export const saveExpensePettyCashFloat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; draft: ExpensePettyCashFloatDraftInput }) => ({
      companyId: companyIdOf(input),
      draft: input.draft,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpensePettyCashFloat> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.manage_advances");
    if (!data.draft.name.trim()) throw new Error("Float name is required.");
    if (data.draft.targetMinor <= 0) {
      throw new Error("Target float amount must be greater than zero.");
    }
    const raw = await callRpc<unknown>(
      context.supabase,
      "save_expense_petty_cash_float",
      {
        _company_id: data.companyId,
        _payload: toExpensePettyCashFloatPayload(data.draft),
      },
      EXPENSE_PETTY_CASH_MIGRATION,
    );
    return mapExpensePettyCashFloat(raw);
  });

export const fundExpensePettyCashFloat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      floatId: string;
      version: number;
      bankAccountId: string;
      amountMinor: number;
      fundDate?: string;
    }) => ({
      companyId: companyIdOf(input),
      floatId: input.floatId,
      version: input.version,
      bankAccountId: input.bankAccountId,
      amountMinor: input.amountMinor,
      fundDate: input.fundDate,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpensePettyCashFloat> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.manage_advances");
    if (!data.bankAccountId) throw new Error("Choose a bank account to fund petty cash.");
    if (data.amountMinor <= 0) throw new Error("Fund amount must be greater than zero.");
    const raw = await callRpc<unknown>(
      context.supabase,
      "fund_expense_petty_cash_float",
      {
        _company_id: data.companyId,
        _float_id: data.floatId,
        _bank_account_id: data.bankAccountId,
        _amount_minor: data.amountMinor,
        _expected_version: data.version,
        _fund_date: data.fundDate ?? null,
      },
      EXPENSE_PETTY_CASH_MIGRATION,
    );
    return mapExpensePettyCashFloat(raw);
  });

export const closeExpensePettyCashFloat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; floatId: string; version: number }) => ({
      companyId: companyIdOf(input),
      floatId: input.floatId,
      version: input.version,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpensePettyCashFloat> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.manage_advances");
    const raw = await callRpc<unknown>(
      context.supabase,
      "close_expense_petty_cash_float",
      {
        _company_id: data.companyId,
        _float_id: data.floatId,
        _expected_version: data.version,
      },
      EXPENSE_PETTY_CASH_MIGRATION,
    );
    return mapExpensePettyCashFloat(raw);
  });

export const linkExpenseClaimPettyCashFloat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      claimId: string;
      version: number;
      floatId: string;
    }) => ({
      companyId: companyIdOf(input),
      claimId: input.claimId,
      version: input.version,
      floatId: input.floatId,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseClaimDetail> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.submit");
    const raw = await callRpc<unknown>(
      context.supabase,
      "link_expense_claim_petty_cash_float",
      {
        _company_id: data.companyId,
        _claim_id: data.claimId,
        _expected_version: data.version,
        _float_id: data.floatId,
      },
      EXPENSE_PETTY_CASH_MIGRATION,
    );
    return mapExpenseClaimDetail(raw);
  });

export const listExpensePerDiemRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; activeOnly?: boolean }) => ({
    companyId: companyIdOf(input),
    activeOnly: input.activeOnly !== false,
  }))
  .handler(async ({ data, context }): Promise<ExpensePerDiemRate[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<{ rates?: unknown[] }>(
      context.supabase,
      "list_expense_per_diem_rates",
      { _company_id: data.companyId, _active_only: data.activeOnly },
      EXPENSE_TRAVEL_MIGRATION,
    );
    return (raw.rates ?? []).map(mapExpensePerDiemRate);
  });

export const saveExpensePerDiemRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      draft: {
        id?: string;
        name: string;
        locationLabel?: string | null;
        rateMinorPerDay: number;
        currencyCode: string;
        accountId: string;
        effectiveFrom: string;
        effectiveTo?: string | null;
        isActive?: boolean;
      };
    }) => ({
      companyId: companyIdOf(input),
      draft: input.draft,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpensePerDiemRate> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.admin");
    if (!data.draft.name.trim()) throw new Error("Per diem rate name is required.");
    if (!data.draft.accountId) throw new Error("Choose an expense account for the rate.");
    if (data.draft.rateMinorPerDay <= 0) {
      throw new Error("Rate per day must be greater than zero.");
    }
    const raw = await callRpc<unknown>(
      context.supabase,
      "save_expense_per_diem_rate",
      {
        _company_id: data.companyId,
        _payload: toExpensePerDiemRatePayload(data.draft),
      },
      EXPENSE_TRAVEL_MIGRATION,
    );
    return mapExpensePerDiemRate(raw);
  });

export const listExpenseCorporateCards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: companyIdOf(input),
  }))
  .handler(async ({ data, context }): Promise<ExpenseCorporateCard[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<{ cards?: unknown[] }>(
      context.supabase,
      "list_expense_corporate_cards",
      { _company_id: data.companyId },
      EXPENSE_CORPORATE_CARD_MIGRATION,
    );
    return (raw.cards ?? []).map(mapExpenseCorporateCard);
  });

export const saveExpenseCorporateCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; draft: ExpenseCorporateCardDraftInput }) => ({
      companyId: companyIdOf(input),
      draft: input.draft,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseCorporateCard> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.manage_cards");
    if (!data.draft.label.trim()) throw new Error("Card label is required.");
    if (!/^\d{4}$/.test(data.draft.last4)) {
      throw new Error("Last 4 digits must be exactly four numbers.");
    }
    if (!data.draft.liabilityAccountId) {
      throw new Error("Choose a liability account for the card.");
    }
    const raw = await callRpc<unknown>(
      context.supabase,
      "save_expense_corporate_card",
      {
        _company_id: data.companyId,
        _payload: toExpenseCorporateCardPayload(data.draft),
      },
      EXPENSE_CORPORATE_CARD_MIGRATION,
    );
    return mapExpenseCorporateCard(raw);
  });

export const listExpenseCorporateCardTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; cardId?: string; status?: string }) => ({
      companyId: companyIdOf(input),
      cardId: input.cardId,
      status: input.status,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseCorporateCardTransaction[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<{ transactions?: unknown[] }>(
      context.supabase,
      "list_expense_corporate_card_transactions",
      {
        _company_id: data.companyId,
        _card_id: data.cardId ?? null,
        _status: data.status ?? null,
      },
      EXPENSE_CORPORATE_CARD_MIGRATION,
    );
    return (raw.transactions ?? []).map(mapExpenseCorporateCardTransaction);
  });

export const saveExpenseCorporateCardTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      draft: {
        id?: string;
        cardId: string;
        transactionDate: string;
        postedDate?: string | null;
        merchantName?: string | null;
        description: string;
        amountMinor: number;
        currencyCode?: string;
        externalRef?: string | null;
      };
    }) => ({
      companyId: companyIdOf(input),
      draft: input.draft,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseCorporateCardTransaction> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.manage_cards");
    if (!data.draft.description.trim()) throw new Error("Description is required.");
    if (data.draft.amountMinor <= 0) throw new Error("Amount must be greater than zero.");
    const raw = await callRpc<unknown>(
      context.supabase,
      "save_expense_corporate_card_transaction",
      {
        _company_id: data.companyId,
        _payload: toExpenseCorporateCardTxPayload(data.draft),
      },
      EXPENSE_CORPORATE_CARD_MIGRATION,
    );
    return mapExpenseCorporateCardTransaction(raw);
  });

export const matchExpenseCorporateCardTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; transactionId: string; claimId: string }) => ({
      companyId: companyIdOf(input),
      transactionId: input.transactionId,
      claimId: input.claimId,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseCorporateCardTransaction> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.manage_cards");
    const raw = await callRpc<unknown>(
      context.supabase,
      "match_expense_corporate_card_transaction",
      {
        _company_id: data.companyId,
        _transaction_id: data.transactionId,
        _claim_id: data.claimId,
      },
      EXPENSE_CORPORATE_CARD_MIGRATION,
    );
    return mapExpenseCorporateCardTransaction(raw);
  });

export const linkExpenseClaimCorporateCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      claimId: string;
      version: number;
      cardId: string;
    }) => ({
      companyId: companyIdOf(input),
      claimId: input.claimId,
      version: input.version,
      cardId: input.cardId,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseClaimDetail> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.submit");
    const raw = await callRpc<unknown>(
      context.supabase,
      "link_expense_claim_corporate_card",
      {
        _company_id: data.companyId,
        _claim_id: data.claimId,
        _expected_version: data.version,
        _card_id: data.cardId,
      },
      EXPENSE_CORPORATE_CARD_MIGRATION,
    );
    return mapExpenseClaimDetail(raw);
  });

export const disputeExpenseCorporateCardTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; transactionId: string; reason?: string }) => ({
      companyId: companyIdOf(input),
      transactionId: input.transactionId,
      reason: input.reason,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseCorporateCardTransaction> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.manage_cards");
    const raw = await callRpc<unknown>(
      context.supabase,
      "dispute_expense_corporate_card_transaction",
      {
        _company_id: data.companyId,
        _transaction_id: data.transactionId,
        _reason: data.reason ?? null,
      },
      EXPENSE_DISPUTES_REBILLING_MIGRATION,
    );
    return mapExpenseCorporateCardTransaction(raw);
  });

export const resolveExpenseCorporateCardTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      transactionId: string;
      resolution?: "unmatched" | "excluded";
    }) => ({
      companyId: companyIdOf(input),
      transactionId: input.transactionId,
      resolution: input.resolution ?? "unmatched",
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseCorporateCardTransaction> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.manage_cards");
    const raw = await callRpc<unknown>(
      context.supabase,
      "resolve_expense_corporate_card_transaction",
      {
        _company_id: data.companyId,
        _transaction_id: data.transactionId,
        _resolution: data.resolution,
      },
      EXPENSE_DISPUTES_REBILLING_MIGRATION,
    );
    return mapExpenseCorporateCardTransaction(raw);
  });

export const prepareExpenseClaimForRebilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      claimId: string;
      version: number;
      customerContactId: string;
    }) => ({
      companyId: companyIdOf(input),
      claimId: input.claimId,
      version: input.version,
      customerContactId: input.customerContactId,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseClaimDetail> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.submit");
    if (!data.customerContactId) throw new Error("Select a customer to rebill.");
    const raw = await callRpc<unknown>(
      context.supabase,
      "prepare_expense_claim_for_rebilling",
      {
        _company_id: data.companyId,
        _claim_id: data.claimId,
        _expected_version: data.version,
        _customer_contact_id: data.customerContactId,
      },
      EXPENSE_DISPUTES_REBILLING_MIGRATION,
    );
    return mapExpenseClaimDetail(raw);
  });

export const markExpenseClaimRebilled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      claimId: string;
      version: number;
      invoiceId: string;
    }) => ({
      companyId: companyIdOf(input),
      claimId: input.claimId,
      version: input.version,
      invoiceId: input.invoiceId,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseClaimDetail> => {
    await assertCompanyMember(context.supabase, data.companyId);
    if (!data.invoiceId) throw new Error("Invoice id is required.");
    const raw = await callRpc<unknown>(
      context.supabase,
      "mark_expense_claim_rebilled",
      {
        _company_id: data.companyId,
        _claim_id: data.claimId,
        _expected_version: data.version,
        _invoice_id: data.invoiceId,
      },
      EXPENSE_DISPUTES_REBILLING_MIGRATION,
    );
    return mapExpenseClaimDetail(raw);
  });

export const getExpenseExitOutstanding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; employeeUserId: string }) => ({
    companyId: companyIdOf(input),
    employeeUserId: input.employeeUserId,
  }))
  .handler(async ({ data, context }): Promise<ExpenseExitOutstanding> => {
    await assertCompanyMember(context.supabase, data.companyId);
    if (!data.employeeUserId) throw new Error("Select an employee.");
    const raw = await callRpc<unknown>(
      context.supabase,
      "get_expense_exit_outstanding",
      {
        _company_id: data.companyId,
        _employee_user_id: data.employeeUserId,
      },
      EXPENSE_EXIT_SETTLEMENT_MIGRATION,
    );
    return mapExpenseExitOutstanding(raw);
  });

export const listExpenseExitSettlements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: companyIdOf(input),
  }))
  .handler(async ({ data, context }): Promise<ExpenseExitSettlement[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<{ settlements?: unknown[] }>(
      context.supabase,
      "list_expense_exit_settlements",
      { _company_id: data.companyId },
      EXPENSE_EXIT_SETTLEMENT_MIGRATION,
    );
    return (raw.settlements ?? []).map(mapExpenseExitSettlement);
  });

export const createExpenseExitSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; employeeUserId: string; notes?: string }) => ({
      companyId: companyIdOf(input),
      employeeUserId: input.employeeUserId,
      notes: input.notes,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseExitSettlement> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.manage_advances");
    if (!data.employeeUserId) throw new Error("Select an employee.");
    const raw = await callRpc<unknown>(
      context.supabase,
      "create_expense_exit_settlement",
      {
        _company_id: data.companyId,
        _employee_user_id: data.employeeUserId,
        _notes: data.notes ?? null,
      },
      EXPENSE_EXIT_SETTLEMENT_MIGRATION,
    );
    return mapExpenseExitSettlement(raw);
  });

export const reclaimExpenseCashAdvance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      advanceId: string;
      version: number;
      bankAccountId: string;
      reclaimDate?: string;
    }) => ({
      companyId: companyIdOf(input),
      advanceId: input.advanceId,
      version: input.version,
      bankAccountId: input.bankAccountId,
      reclaimDate: input.reclaimDate,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseCashAdvance> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.manage_advances");
    if (!data.bankAccountId) throw new Error("Choose a bank account.");
    const raw = await callRpc<unknown>(
      context.supabase,
      "reclaim_expense_cash_advance",
      {
        _company_id: data.companyId,
        _advance_id: data.advanceId,
        _bank_account_id: data.bankAccountId,
        _expected_version: data.version,
        _reclaim_date: data.reclaimDate ?? null,
      },
      EXPENSE_EXIT_SETTLEMENT_MIGRATION,
    );
    return mapExpenseCashAdvance(raw);
  });

export const finalizeExpenseExitSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      settlementId: string;
      version: number;
      bankAccountId: string;
    }) => ({
      companyId: companyIdOf(input),
      settlementId: input.settlementId,
      version: input.version,
      bankAccountId: input.bankAccountId,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseExitSettlement> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.manage_advances");
    if (!data.bankAccountId) throw new Error("Choose a bank account for advance reclaim.");
    const raw = await callRpc<unknown>(
      context.supabase,
      "finalize_expense_exit_settlement",
      {
        _company_id: data.companyId,
        _settlement_id: data.settlementId,
        _expected_version: data.version,
        _bank_account_id: data.bankAccountId,
      },
      EXPENSE_EXIT_SETTLEMENT_MIGRATION,
    );
    return mapExpenseExitSettlement(raw);
  });

export const listExpenseCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: companyIdOf(input),
  }))
  .handler(async ({ data, context }): Promise<ExpenseCategory[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<{ categories?: unknown[] }>(
      context.supabase,
      "list_expense_categories",
      { _company_id: data.companyId },
      EXPENSE_RISK_MIGRATION,
    );
    return (raw.categories ?? []).map((row) => {
      const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      return {
        id: String(r["id"] ?? ""),
        code: String(r["code"] ?? ""),
        name: String(r["name"] ?? ""),
      };
    });
  });

export const suggestExpenseCategory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; merchantName: string }) => ({
    companyId: companyIdOf(input),
    merchantName: input.merchantName,
  }))
  .handler(async ({ data, context }): Promise<ExpenseCategorySuggestion> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<unknown>(
      context.supabase,
      "suggest_expense_category",
      {
        _company_id: data.companyId,
        _merchant_name: data.merchantName,
      },
      EXPENSE_RISK_MIGRATION,
    );
    return mapExpenseCategorySuggestion(raw);
  });

export const findExpenseClaimDuplicates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; claimId: string }) => ({
    companyId: companyIdOf(input),
    claimId: input.claimId,
  }))
  .handler(async ({ data, context }): Promise<ExpenseClaimDuplicateMatch[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<unknown>(
      context.supabase,
      "find_expense_claim_duplicates",
      {
        _company_id: data.companyId,
        _claim_id: data.claimId,
      },
      EXPENSE_RISK_MIGRATION,
    );
    return mapExpenseClaimDuplicates(raw);
  });

export const scanExpenseClaimRisks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; claimId: string }) => ({
    companyId: companyIdOf(input),
    claimId: input.claimId,
  }))
  .handler(async ({ data, context }): Promise<ExpenseClaimRiskScan> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<unknown>(
      context.supabase,
      "scan_expense_claim_risks",
      {
        _company_id: data.companyId,
        _claim_id: data.claimId,
      },
      EXPENSE_RISK_MIGRATION,
    );
    return mapExpenseClaimRiskScan(raw);
  });

export const requestExpenseReceiptOcr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; entryId: string }) => ({
    companyId: companyIdOf(input),
    entryId: input.entryId,
  }))
  .handler(async ({ data, context }): Promise<ExpenseReceiptInboxEntry> => {
    await assertCompanyPermission(context.supabase, data.companyId, "expenses.submit");
    const raw = await callRpc<unknown>(
      context.supabase,
      "request_expense_receipt_ocr",
      {
        _company_id: data.companyId,
        _entry_id: data.entryId,
      },
      EXPENSE_RISK_MIGRATION,
    );
    return mapReceiptInboxEntry(raw);
  });

export const getExpenseManagementReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; fromDate?: string; toDate?: string }) => ({
      companyId: companyIdOf(input),
      fromDate: input.fromDate,
      toDate: input.toDate,
    }),
  )
  .handler(async ({ data, context }): Promise<ExpenseManagementReport> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<unknown>(
      context.supabase,
      "get_expense_management_report",
      {
        _company_id: data.companyId,
        _from_date: data.fromDate ?? null,
        _to_date: data.toDate ?? null,
      },
      EXPENSE_REPORTS_MIGRATION,
    );
    return mapExpenseManagementReport(raw);
  });

export const exportExpenseClaimsReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; fromDate?: string; toDate?: string }) => ({
      companyId: companyIdOf(input),
      fromDate: input.fromDate,
      toDate: input.toDate,
    }),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ fromDate: string; toDate: string; rows: ExpenseClaimExportRow[] }> => {
      await assertCompanyMember(context.supabase, data.companyId);
      const raw = await callRpc<{ from_date?: string; to_date?: string; claims?: unknown[] }>(
        context.supabase,
        "export_expense_claims_report",
        {
          _company_id: data.companyId,
          _from_date: data.fromDate ?? null,
          _to_date: data.toDate ?? null,
        },
        EXPENSE_REPORTS_MIGRATION,
      );
      return {
        fromDate: String(raw.from_date ?? data.fromDate ?? ""),
        toDate: String(raw.to_date ?? data.toDate ?? ""),
        rows: mapExpenseClaimExportRows(raw),
      };
    },
  );

export const listExpenseClaimAuditEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; limit?: number }) => ({
    companyId: companyIdOf(input),
    limit: input.limit,
  }))
  .handler(async ({ data, context }): Promise<ExpenseClaimAuditEvent[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<unknown>(
      context.supabase,
      "list_expense_claim_audit_events",
      {
        _company_id: data.companyId,
        _limit: data.limit ?? 50,
      },
      EXPENSE_REPORTS_MIGRATION,
    );
    return mapExpenseClaimAuditEvents(raw);
  });

export const previewLegacyEmployeeExpenseMigration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: companyIdOf(input),
  }))
  .handler(async ({ data, context }): Promise<LegacyExpenseMigrationPreview> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<unknown>(
      context.supabase,
      "preview_legacy_employee_expense_migration",
      { _company_id: data.companyId },
      EXPENSE_NOTIFICATIONS_MIGRATION,
    );
    return mapLegacyExpenseMigrationPreview(raw);
  });

export const importLegacyEmployeeExpenseClaims = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; limit?: number }) => ({
    companyId: companyIdOf(input),
    limit: input.limit,
  }))
  .handler(async ({ data, context }): Promise<LegacyExpenseMigrationResult> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<unknown>(
      context.supabase,
      "import_legacy_employee_expense_claims",
      {
        _company_id: data.companyId,
        _limit: data.limit ?? 50,
      },
      EXPENSE_NOTIFICATIONS_MIGRATION,
    );
    return mapLegacyExpenseMigrationResult(raw);
  });
