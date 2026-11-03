import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { assertOrderDate } from "@/lib/purchases/purchase-order";
import { workflowRpc } from "@/lib/workflows-rpc.server";
import { loadCompanyDefaults } from "@/lib/sales/sales-common";
export type DeferralEntry = {
  id: string;
  period_no: number;
  due_on: string;
  amount_minor: number;
  journal_id: string | null;
  posted_on: string | null;
  journals: { reversed_by_journal_id: string | null } | null;
};
export type DeferralSchedule = {
  id: string;
  name: string;
  reference: string;
  kind: string;
  total_minor: number;
  status: string;
  start_date: string;
  periods: number;
  deferral_entries: DeferralEntry[];
};
export const listDeferrals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; page?: number }) => ({
    companyId: assertUuid(input.companyId),
    page: Math.min(100000, Math.max(1, Math.floor(input.page ?? 1))),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const {
      data: rows,
      error,
      count,
    } = await context.supabase
      .from("deferral_schedules" as never)
      .select("*,deferral_entries(*,journals(reversed_by_journal_id))" as never, { count: "exact" })
      .eq("company_id" as never, data.companyId as never)
      .eq("deferral_entries.company_id" as never, data.companyId as never)
      .order("created_at" as never, { ascending: false })
      .order("id" as never)
      .range((data.page - 1) * 25, data.page * 25 - 1);
    if (error) throw new Error(error.message);
    const defaults = await loadCompanyDefaults(context.supabase, data.companyId);
    return {
      rows: (rows ?? []) as unknown as DeferralSchedule[],
      total: count ?? 0,
      today: defaults.today,
      currency: defaults.baseCurrency,
    };
  });
export const createDeferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      requestId: string;
      kind: "prepaid_expense" | "deferred_income";
      name: string;
      reference: string;
      debitAccountId: string;
      creditAccountId: string;
      totalMinor: number;
      startDate: string;
      periods: number;
    }) => {
      if (
        !["prepaid_expense", "deferred_income"].includes(input.kind) ||
        !Number.isSafeInteger(input.totalMinor) ||
        !Number.isInteger(input.periods) ||
        input.periods < 1 ||
        input.periods > 120 ||
        input.totalMinor < input.periods ||
        !input.name.trim() ||
        input.name.trim().length > 160 ||
        !input.reference.trim() ||
        input.reference.trim().length > 500
      )
        throw new Error("Enter a valid name, source reference, positive amount and 1–120 periods");
      if (input.debitAccountId === input.creditAccountId)
        throw new Error("Use different recognition and deferral accounts");
      return {
        ...input,
        companyId: assertUuid(input.companyId),
        requestId: assertUuid(input.requestId, "request"),
        debitAccountId: assertUuid(input.debitAccountId, "debit account"),
        creditAccountId: assertUuid(input.creditAccountId, "credit account"),
        startDate: assertOrderDate(input.startDate),
        name: input.name.trim(),
        reference: input.reference.trim(),
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.post");
    const { companyId, ...payload } = data;
    return workflowRpc<{ id: string }>(context.supabase, "create_deferral_schedule", {
      _company: companyId,
      _payload: payload,
    });
  });
export const postDeferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; entryId: string; postingDate: string }) => ({
    companyId: assertUuid(input.companyId),
    entryId: assertUuid(input.entryId, "entry"),
    postingDate: assertOrderDate(input.postingDate),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.post");
    return workflowRpc<{ journalId: string }>(context.supabase, "post_deferral_entry", {
      _company: data.companyId,
      _entry: data.entryId,
      _posting_date: data.postingDate,
    });
  });
export const cancelDeferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; scheduleId: string }) => ({
    companyId: assertUuid(input.companyId),
    scheduleId: assertUuid(input.scheduleId, "schedule"),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.post");
    await workflowRpc(context.supabase, "cancel_deferral_schedule", {
      _company: data.companyId,
      _schedule: data.scheduleId,
    });
    return { cancelled: true };
  });
