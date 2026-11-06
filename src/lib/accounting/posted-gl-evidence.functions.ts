import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import {
  reviewPostedGlEvidence,
  type GlAuditAccount,
  type GlAuditJournal,
  type GlAuditLine,
  type GlAuditPeriod,
  type GlAuditReversal,
  type PostedGlEvidenceResult,
} from "./posted-gl-evidence";

/** Bound one-journal read, no mutation; original minor units remain exact text. */
export const auditPostedGlEvidence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; journalId: string }) => ({
    companyId: assertUuid(input?.companyId),
    journalId: assertUuid(input?.journalId, "journal"),
  }))
  .handler(async ({ data, context }): Promise<PostedGlEvidenceResult> => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const { data: rawJournal, error: journalError } = await context.supabase
      .from("journals" as never)
      .select(
        "id, company_id, journal_number, journal_date, status, currency_code, source_type, reversed_by_journal_id, reverses_journal_id" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.journalId as never)
      .maybeSingle();
    if (journalError) throw new Error(journalError.message);
    if (!rawJournal) throw new Error("The selected journal was not found in this organisation.");
    const journal = rawJournal as unknown as GlAuditJournal;
    if (journal.id !== data.journalId || journal.company_id !== data.companyId) {
      throw new Error("Journal identity or organisation does not match the request.");
    }
    if (journal.status !== "posted") {
      return reviewPostedGlEvidence(data.companyId, journal, [], [], [], []);
    }

    const { data: rawLines, error: lineError } = await context.supabase
      .from("journal_lines" as never)
      .select("id, company_id, journal_id, line_no, account_id, debit_minor, credit_minor" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("journal_id" as never, data.journalId as never)
      .order("line_no" as never)
      .limit(501);
    if (lineError) throw new Error(lineError.message);
    const lines = (rawLines ?? []) as unknown as GlAuditLine[];
    if (lines.length >= 501) {
      throw new Error("GL evidence exceeds the 500-line limit; no incomplete audit is returned.");
    }

    const accountIds = [...new Set(lines.map((line) => line.account_id).filter(Boolean))];
    let accounts: GlAuditAccount[] = [];
    if (accountIds.length) {
      const { data: rawAccounts, error: accountsError } = await context.supabase
        .from("accounts" as never)
        .select("id, company_id, code, name" as never)
        .eq("company_id" as never, data.companyId as never)
        .in("id" as never, accountIds as never)
        .limit(501);
      if (accountsError) throw new Error(accountsError.message);
      accounts = (rawAccounts ?? []) as unknown as GlAuditAccount[];
      if (accounts.length > accountIds.length || accounts.length >= 501) {
        throw new Error("Account evidence exceeds the safe audit boundary.");
      }
    }

    const { data: rawPeriods, error: periodError } = await context.supabase
      .from("accounting_periods" as never)
      .select("id, company_id, start_date, end_date, status" as never)
      .eq("company_id" as never, data.companyId as never)
      .lte("start_date" as never, journal.journal_date as never)
      .gte("end_date" as never, journal.journal_date as never)
      .limit(3);
    if (periodError) throw new Error(periodError.message);
    const periods = (rawPeriods ?? []) as unknown as GlAuditPeriod[];
    if (periods.length >= 3) {
      throw new Error("Too many overlapping accounting periods; no incomplete audit is returned.");
    }

    const relatedIds = [
      ...new Set([journal.reverses_journal_id, journal.reversed_by_journal_id].filter(
        (id): id is string => Boolean(id),
      )),
    ];
    let reversals: GlAuditReversal[] = [];
    if (relatedIds.length) {
      const { data: rawRelated, error: reversalError } = await context.supabase
        .from("journals" as never)
        .select(
          "id, company_id, status, reverses_journal_id, reversed_by_journal_id" as never,
        )
        .eq("company_id" as never, data.companyId as never)
        .in("id" as never, relatedIds as never)
        .limit(3);
      if (reversalError) throw new Error(reversalError.message);
      reversals = (rawRelated ?? []) as unknown as GlAuditReversal[];
      if (reversals.length > relatedIds.length) {
        throw new Error("Related-journal evidence exceeds the expected cardinality.");
      }
    }
    return reviewPostedGlEvidence(data.companyId, journal, lines, accounts, periods, reversals);
  });
