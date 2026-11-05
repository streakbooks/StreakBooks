import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import {
  auditRealisedFxJournals,
  type FxRealisedAuditJournal,
  type FxRealisedAuditLine,
  type FxRealisedAuditResult,
  type FxRealisedAuditRow,
  type FxRealisedAuditTag,
} from "./fx-ledger-audit";

/**
 * Read-only, tenant-scoped audit of the 50 most recent nonzero realised FX rows.
 * No posting or rate fetch. RLS stays in force for every source table.
 */
export const auditRecentRealisedFx = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: assertUuid(input.companyId),
  }))
  .handler(async ({ data, context }): Promise<FxRealisedAuditResult> => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");

    const { data: rawRows, error: recordsError } = await context.supabase
      .from("fx_realised_postings" as never)
      .select(
        "id, kind, allocation_id, currency_code, gain_loss_base_minor, journal_id, reversal_journal_id, reversed_at" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .neq("gain_loss_base_minor" as never, 0 as never)
      .order("created_at" as never, { ascending: false })
      .limit(51);
    if (recordsError) throw new Error(recordsError.message);

    const fetched = (rawRows ?? []) as unknown as FxRealisedAuditRow[];
    const hasMore = fetched.length > 50;
    const records = fetched.slice(0, 50);
    const ids = [...new Set(records.map((record) => record.journal_id).filter((id): id is string => !!id))];
    let journals: FxRealisedAuditJournal[] = [];
    let lines: FxRealisedAuditLine[] = [];
    let tags: FxRealisedAuditTag[] = [];
    if (ids.length) {
      const { data: journalRows, error: journalError } = await context.supabase
        .from("journals" as never)
        .select(
          "id, status, source_type, source_id, idempotency_key, reversed_by_journal_id" as never,
        )
        .eq("company_id" as never, data.companyId as never)
        .in("id" as never, ids as never)
        .limit(51);
      if (journalError) throw new Error(journalError.message);
      journals = (journalRows ?? []) as unknown as FxRealisedAuditJournal[];

      const { data: tagRows, error: tagError } = await context.supabase
        .from("fx_journal_tags" as never)
        .select("journal_id, kind, currency_code" as never)
        .eq("company_id" as never, data.companyId as never)
        .in("journal_id" as never, ids as never)
        .limit(51);
      if (tagError) throw new Error(tagError.message);
      tags = (tagRows ?? []) as unknown as FxRealisedAuditTag[];

      const { data: lineRows, error: lineError } = await context.supabase
        .from("journal_lines" as never)
        .select("journal_id, debit_minor, credit_minor" as never)
        .eq("company_id" as never, data.companyId as never)
        .in("journal_id" as never, ids as never)
        .limit(501);
      if (lineError) throw new Error(lineError.message);
      lines = (lineRows ?? []) as unknown as FxRealisedAuditLine[];
      if (lines.length === 501) {
        throw new Error("Linked FX journals exceed the safe read-only audit limit.");
      }
    }

    return auditRealisedFxJournals(records, journals, lines, tags, 50, hasMore);
  });
