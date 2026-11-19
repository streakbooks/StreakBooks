import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { callSalesRpc, requireRpc } from "@/lib/sales/rpc";

const MIGRATION = "20261025300300_ops_recurring_journals.sql";

export type RecurringJournalRow = {
  id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  next_date: string;
  interval_months: number;
  max_occurrences: number | null;
  is_active: boolean;
  last_run_at: string | null;
  last_error: string | null;
  updated_at: string;
  occurrences: number;
  total_debit_minor: number;
};

export const listRecurringJournals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: assertUuid(input.companyId) }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: rows, error } = await context.supabase
      .from("recurring_journal_templates" as never)
      .select(
        "id, name, start_date, end_date, next_date, interval_months, max_occurrences, is_active, last_run_at, last_error, updated_at, lines" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .order("next_date" as never, { ascending: true } as never)
      .limit(200);
    if (error) throw new Error(error.message);
    const templates = (rows ?? []) as unknown as Array<
      Omit<RecurringJournalRow, "occurrences" | "total_debit_minor"> & {
        lines: Array<{ debitMinor?: number }>;
      }
    >;
    const ids = templates.map((t) => t.id);
    const counts = new Map<string, number>();
    if (ids.length) {
      const { data: occ, error: occError } = await context.supabase
        .from("recurring_journal_occurrences" as never)
        .select("template_id" as never)
        .eq("company_id" as never, data.companyId as never)
        .in("template_id" as never, ids as never);
      if (occError) throw new Error(occError.message);
      for (const o of (occ ?? []) as unknown as Array<{ template_id: string }>) {
        counts.set(o.template_id, (counts.get(o.template_id) ?? 0) + 1);
      }
    }
    return templates.map((t): RecurringJournalRow => {
      const { lines, ...rest } = t;
      return {
        ...rest,
        occurrences: counts.get(t.id) ?? 0,
        total_debit_minor: (lines ?? []).reduce((s, l) => s + Number(l.debitMinor ?? 0), 0),
      };
    });
  });

const scheduleEdit = z.object({
  companyId: z.uuid(),
  templateId: z.uuid(),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  name: z.string().trim().min(1, "Enter a schedule name").max(160),
  intervalMonths: z.number().int().min(1).max(12),
  endDate: z.iso.date().nullable(),
  maxOccurrences: z.number().int().min(1).max(2_147_483_647).nullable(),
});

export const updateRecurringJournalSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.input<typeof scheduleEdit>) => scheduleEdit.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "journals.manual");

    const { data: current, error: currentError } = await supabase
      .from("recurring_journal_templates" as never)
      .select("start_date" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.templateId as never)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);
    if (!current) throw new Error("Recurring journal schedule not found");
    if (data.endDate && data.endDate < (current as { start_date: string }).start_date) {
      throw new Error("End date must be on or after the first scheduled date");
    }

    // The posting worker and pause/resume update the same revision. Postgres rechecks
    // this filter after waiting on a concurrent update to the row.
    const updatedAt = new Date(
      Math.max(Date.now(), Date.parse(data.expectedUpdatedAt) + 1),
    ).toISOString();
    const { data: saved, error } = await supabase
      .from("recurring_journal_templates" as never)
      .update({
        name: data.name,
        interval_months: data.intervalMonths,
        end_date: data.endDate,
        max_occurrences: data.maxOccurrences,
        updated_at: updatedAt,
      } as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.templateId as never)
      .eq("updated_at" as never, data.expectedUpdatedAt as never)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!saved) {
      throw new Error("This schedule changed. Reopen the editor and try again.");
    }
    return { ok: true };
  });

/** "Run due now": posts every occurrence due up to today (or the given date) for this company. */
export const runDueRecurringJournals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; asOfDate?: string }) => ({
    companyId: assertUuid(input.companyId),
    asOfDate: input.asOfDate && /^\d{4}-\d{2}-\d{2}$/.test(input.asOfDate) ? input.asOfDate : null,
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "journals.manual");
    await assertCompanyPermission(supabase, data.companyId, "accounting.post");
    const rpc = await callSalesRpc<{
      posted: number;
      templates: Array<{ template_id: string; posted: number; error: string | null }>;
    }>(supabase, "run_due_recurring_journals", {
      company_id: data.companyId,
      as_of_date: data.asOfDate,
    });
    const done = requireRpc(rpc, "run_due_recurring_journals", MIGRATION);
    return {
      posted: Number(done.posted),
      failed: done.templates
        .filter((t) => t.error)
        .map((t) => ({ id: t.template_id, message: t.error! })),
    };
  });

export const setRecurringJournalActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; templateId: string; active: boolean }) => ({
    companyId: assertUuid(input.companyId),
    templateId: assertUuid(input.templateId, "template"),
    active: Boolean(input.active),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "journals.manual");
    const { error } = await context.supabase
      .from("recurring_journal_templates" as never)
      .update({ is_active: data.active, updated_at: new Date().toISOString() } as never)
      .eq("id" as never, data.templateId as never)
      .eq("company_id" as never, data.companyId as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
