import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import {
  auditFxRevaluationRun,
  type FxRunAuditAccount,
  type FxRunAuditJournal,
  type FxRunAuditLine,
  type FxRunAuditReport,
  type FxRunAuditReversal,
  type FxRunAuditSource,
  type FxRunAuditTag,
} from "./fx-revaluation-ledger-audit";

/**
 * Inspect one stored revaluation run under the caller's authenticated RLS context.
 * Every query is company-scoped. This never posts, reverses or changes any journal.
 */
export const auditFxRevaluationLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; runId: string }) => ({
    companyId: assertUuid(input.companyId),
    runId: assertUuid(input.runId, "run"),
  }))
  .handler(async ({ data, context }): Promise<FxRunAuditReport> => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");

    const { data: company, error: companyError } = await context.supabase
      .from("companies" as never)
      .select("id, base_currency" as never)
      .eq("id" as never, data.companyId as never)
      .single();
    if (companyError || !company) {
      throw new Error(companyError?.message ?? "Organisation is not available.");
    }

    const { data: rawRun, error: runError } = await context.supabase
      .from("fx_revaluation_runs" as never)
      .select(
        "id, as_of_date, reverse_on, journal_ids, total_gain_minor, total_loss_minor" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.runId as never)
      .single();
    if (runError || !rawRun) {
      throw new Error(runError?.message ?? "Revaluation run is not available.");
    }
    const run = rawRun as unknown as FxRunAuditSource;
    if (!Array.isArray(run.journal_ids) || run.journal_ids.length > 100) {
      throw new Error("The revaluation run exceeds the audit's supported journal limit.");
    }

    let journals: FxRunAuditJournal[] = [];
    let tags: FxRunAuditTag[] = [];
    let reversals: FxRunAuditReversal[] = [];
    let lines: FxRunAuditLine[] = [];
    let accounts: FxRunAuditAccount[] = [];
    const journalIds = [...new Set(run.journal_ids)];
    if (journalIds.length) {
      const { data: rawReversals, error: reversalError } = await context.supabase
        .from("journal_auto_reversals" as never)
        .select("journal_id, origin, status, reverse_on, reversal_journal_id" as never)
        .eq("company_id" as never, data.companyId as never)
        .in("journal_id" as never, journalIds as never)
        .limit(101);
      if (reversalError) throw new Error(reversalError.message);
      reversals = (rawReversals ?? []) as unknown as FxRunAuditReversal[];
      if (reversals.length > 100) throw new Error("Reversal results exceed the audit limit.");

      const { data: rawTags, error: tagError } = await context.supabase
        .from("fx_journal_tags" as never)
        .select("journal_id, currency_code, kind" as never)
        .eq("company_id" as never, data.companyId as never)
        .in("journal_id" as never, journalIds as never)
        .limit(101);
      if (tagError) throw new Error(tagError.message);
      tags = (rawTags ?? []) as unknown as FxRunAuditTag[];
      if (tags.length > 100) throw new Error("Currency-tag results exceed the audit limit.");

      const reverseIds = reversals
        .map((row) => row.reversal_journal_id)
        .filter((id): id is string => Boolean(id));
      const relatedIds = [...new Set([...journalIds, ...reverseIds])];
      if (relatedIds.length > 200) {
        throw new Error("Too many original and reversal journals to verify.");
      }
      const { data: rawJournals, error: journalError } = await context.supabase
        .from("journals" as never)
        .select(
          "id, status, journal_date, source_type, source_id, idempotency_key, currency_code, fx_rate_to_base, reverses_journal_id, reversed_by_journal_id" as never,
        )
        .eq("company_id" as never, data.companyId as never)
        .in("id" as never, relatedIds as never)
        .limit(201);
      if (journalError) throw new Error(journalError.message);
      journals = (rawJournals ?? []) as unknown as FxRunAuditJournal[];
      if (journals.length > 200) throw new Error("Too many journal records to verify.");

      const { data: rawLines, error: linesError } = await context.supabase
        .from("journal_lines" as never)
        .select("journal_id, account_id, debit_minor, credit_minor" as never)
        .eq("company_id" as never, data.companyId as never)
        .in("journal_id" as never, relatedIds as never)
        .limit(2001);
      if (linesError) throw new Error(linesError.message);
      lines = (rawLines ?? []) as unknown as FxRunAuditLine[];
      if (lines.length > 2000) {
        throw new Error("Ledger lines exceed the safe audit limit; no incomplete result was returned.");
      }

      const accountIds = [...new Set(lines.map((line) => line.account_id))];
      if (accountIds.length > 2000) {
        throw new Error("Accounts exceed the safe audit limit.");
      }
      if (accountIds.length) {
        const { data: rawAccounts, error: accountsError } = await context.supabase
          .from("accounts" as never)
          .select("id, code, name, account_type" as never)
          .eq("company_id" as never, data.companyId as never)
          .in("id" as never, accountIds as never)
          .limit(2001);
        if (accountsError) throw new Error(accountsError.message);
        accounts = (rawAccounts ?? []) as unknown as FxRunAuditAccount[];
        if (accounts.length > 2000) throw new Error("Account evidence was truncated.");
      }
    }

    return auditFxRevaluationRun(
      run,
      (company as { base_currency: string }).base_currency,
      journals,
      tags,
      reversals,
      lines,
      accounts,
    );
  });
