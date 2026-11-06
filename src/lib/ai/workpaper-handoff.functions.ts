import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { isoDate } from "@/lib/accountant/practice-work";
import {
  linkAiReviewsToWorkpaper,
  countAiWorkpaperEvidence,
  type AiWorkpaperReviewSource,
  type AiWorkpaperJournalSource,
  type AiWorkpaperEvidenceLink,
} from "@/lib/ai/workpaper-handoff";

export const workpaperEvidenceInput = z.object({
  companyId: z.string().uuid(),
  accountId: z.string().uuid(),
  asOf: isoDate,
}).strict();

export type AiWorkpaperEvidenceResponse = {
  accountId: string;
  asOf: string;
  links: AiWorkpaperEvidenceLink[];
  scannedReviews: number;
  latestReviewsTruncated: boolean;
  counts: ReturnType<typeof countAiWorkpaperEvidence>;
  disclaimer: string;
};

/**
 * Read-only handoff to Accountant Tools. Never mutate an accounting workpaper,
 * infer a supporting balance, or treat an AI review as a workpaper sign-off.
 * All financial fact joins stay company-scoped.
 */
export const getAiWorkpaperEvidence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => workpaperEvidenceInput.parse(input))
  .handler(async ({ data, context }): Promise<AiWorkpaperEvidenceResponse> => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    await assertCompanyPermission(context.supabase, data.companyId, "ai.use");
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");

    const { data: account, error: accountError } = await context.supabase
      .from("accounts" as never)
      .select("id,account_type,is_postable" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.accountId as never)
      .maybeSingle();
    if (accountError) throw new Error("Could not verify the workpaper account.");
    const accountRecord = account as { id: string; account_type: string; is_postable: boolean } | null;
    if (
      !accountRecord ||
      !accountRecord.is_postable ||
      !["asset", "liability", "equity"].includes(accountRecord.account_type)
    ) throw new Error("Select an accessible postable balance-sheet account.");

    // The latest 100 case records form a bounded investigation window.
    // A truncated sample must never be displayed as complete journal coverage.
    const { data: caseRows, error: casesError } = await context.supabase
      .from("ai_journal_review_cases" as never)
      .select("id,journal_id,status,assigned_to,reviewed_by,reviewed_at,updated_at" as never)
      .eq("company_id" as never, data.companyId as never)
      .order("updated_at" as never, { ascending: false })
      .order("id" as never, { ascending: false })
      .limit(101);
    if (casesError) throw new Error("AI journal review cases could not be read.");
    const latestReviewsTruncated = (caseRows ?? []).length > 100;
    const cases = ((caseRows ?? []).slice(0, 100)) as AiWorkpaperReviewSource[];
    if (!cases.length) {
      return {
        accountId: data.accountId,
        asOf: data.asOf,
        links: [],
        scannedReviews: 0,
        latestReviewsTruncated: false,
        counts: { reviewed: 0, followUp: 0, notPosted: 0 },
        disclaimer: "No AI review cases were found. This does not establish that the account is reconciled.",
      };
    }
    const journalIds = [...new Set(cases.map((item) => item.journal_id))];

    // A journal can contain multiple lines for the same account. Refuse a
    // silently incomplete line match, instead of returning false absence.
    const [lineLookup, headersLookup] = await Promise.all([
      context.supabase
        .from("journal_lines" as never)
        .select("journal_id" as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("account_id" as never, data.accountId as never)
        .in("journal_id" as never, journalIds as never)
        .limit(501),
      context.supabase
        .from("journals" as never)
        .select("id,journal_number,journal_date,status,source_type" as never)
        .eq("company_id" as never, data.companyId as never)
        .in("id" as never, journalIds as never)
        .lte("journal_date" as never, data.asOf as never)
        .limit(101),
    ]);
    if (lineLookup.error || headersLookup.error)
      throw new Error("The posted-ledger linkage for these AI reviews is unavailable.");
    if ((lineLookup.data ?? []).length > 500)
      throw new Error("Too many matching journal lines for a complete review sample. Narrow the source workpaper investigation.");

    const lineJournalIds = ((lineLookup.data ?? []) as Array<{ journal_id: string }>).map((line) => line.journal_id);
    const journalHeaders = (headersLookup.data ?? []) as AiWorkpaperJournalSource[];
    const links = linkAiReviewsToWorkpaper(cases, journalHeaders, lineJournalIds, data.asOf);
    return {
      accountId: data.accountId,
      asOf: data.asOf,
      links,
      scannedReviews: cases.length,
      latestReviewsTruncated,
      counts: countAiWorkpaperEvidence(links),
      disclaimer: latestReviewsTruncated
        ? "Only the 100 most recently updated company AI review cases were checked for this account. Older cases may be omitted. These are supplemental evidence only, not a complete workpaper review."
        : "These are linked AI journal-review records, not supporting balances, formal workpaper sign-offs, or authority to post journals.",
    };
  });
