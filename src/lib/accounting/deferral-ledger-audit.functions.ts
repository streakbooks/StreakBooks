import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import {
  auditDeferralRecognitionJournals,
  type DeferralAuditEntry,
  type DeferralAuditJournal,
  type DeferralAuditLine,
  type DeferralAuditSource,
  type DeferralAuditResult,
} from "./deferral-ledger-audit";

/**
 * Only one schedule is audited per request (maximum 120 recognition entries).
 * All reads are tenant-scoped through the caller's authenticated RLS context.
 * No service role, schema migration or journal mutation is used.
 */
export const auditDeferralLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; scheduleId: string }) => ({
    companyId: assertUuid(input.companyId),
    scheduleId: assertUuid(input.scheduleId, "schedule"),
  }))
  .handler(async ({ data, context }): Promise<DeferralAuditResult> => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const { data: source, error: scheduleError } = await context.supabase
      .from("deferral_schedules" as never)
      .select("id, name, total_minor, periods, debit_account_id, credit_account_id" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.scheduleId as never)
      .single();
    if (scheduleError || !source) {
      throw new Error(scheduleError?.message ?? "Deferral schedule is not available.");
    }

    const { data: rawEntries, error: entriesError } = await context.supabase
      .from("deferral_entries" as never)
      .select("id, period_no, amount_minor, journal_id" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("schedule_id" as never, data.scheduleId as never)
      .order("period_no" as never)
      .limit(121);
    if (entriesError) throw new Error(entriesError.message);
    const entries = (rawEntries ?? []) as unknown as DeferralAuditEntry[];
    if (entries.length > 120) {
      throw new Error("Too many recognition periods to verify safely.");
    }

    const journalIds = [
      ...new Set(entries.map((entry) => entry.journal_id).filter((id): id is string => !!id)),
    ];
    let journals: DeferralAuditJournal[] = [];
    let lines: DeferralAuditLine[] = [];
    if (journalIds.length) {
      const { data: rawJournals, error: journalsError } = await context.supabase
        .from("journals" as never)
        .select("id, status, idempotency_key, reversed_by_journal_id" as never)
        .eq("company_id" as never, data.companyId as never)
        .in("id" as never, journalIds as never)
        .limit(121);
      if (journalsError) throw new Error(journalsError.message);
      journals = (rawJournals ?? []) as unknown as DeferralAuditJournal[];

      const { data: rawLines, error: linesError } = await context.supabase
        .from("journal_lines" as never)
        .select("journal_id, account_id, debit_minor, credit_minor" as never)
        .eq("company_id" as never, data.companyId as never)
        .in("journal_id" as never, journalIds as never)
        .limit(1000);
      if (linesError) throw new Error(linesError.message);
      lines = (rawLines ?? []) as unknown as DeferralAuditLine[];
      if (lines.length === 1000) {
        throw new Error("Linked journal lines exceed the safe audit limit.");
      }
    }

    return auditDeferralRecognitionJournals(
      source as unknown as DeferralAuditSource,
      entries,
      journals,
      lines,
    );
  });
