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

export const workpaperEvidenceInput = z
  .object({
    companyId: z.string().uuid(),
    accountId: z.string().uuid(),
    asOf: isoDate,
    page: z.number().int().min(0).max(10000).default(0),
  })
  .strict();

export type AiWorkpaperEvidenceResponse = {
  accountId: string;
  asOf: string;
  page: number;
  pageSize: number;
  total: number;
  links: AiWorkpaperEvidenceLink[];
  /** Counts only on this returned page; not a company or ledger-wide result. */
  pageCounts: ReturnType<typeof countAiWorkpaperEvidence>;
  disclaimer: string;
};

type DbEvidenceRow = {
  review_id: string;
  journal_id: string;
  review_status: AiWorkpaperReviewSource["status"];
  reviewed_by: string | null;
  reviewed_at: string | null;
  updated_at: string;
  journal_number: number;
  journal_date: string;
  journal_status: string;
  source_type: string;
};

type DbEvidencePage = {
  total: number | string;
  page: number;
  pageSize: number;
  rows: DbEvidenceRow[];
};

/**
 * Read-only, RLS-preserving, account-filtered pagination of ALL review cases.
 * The database filters by actual journal lines before paginating and reports
 * an exact matching count. It never changes a workpaper or review status.
 */
export const getAiWorkpaperEvidence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => workpaperEvidenceInput.parse(input))
  .handler(async ({ data, context }): Promise<AiWorkpaperEvidenceResponse> => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    await assertCompanyPermission(context.supabase, data.companyId, "ai.use");
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");

    const { data: payload, error } = await context.supabase.rpc(
      "list_ai_workpaper_evidence_page" as never,
      {
        _company_id: data.companyId,
        _account_id: data.accountId,
        _as_of: data.asOf,
        _page: data.page,
      } as never,
    );
    if (error)
      throw new Error(
        error.message.includes("list_ai_workpaper_evidence_page")
          ? "AI workpaper evidence pagination requires the latest database migration."
          : error.message,
      );
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new Error("Invalid evidence page returned by the database.");
    const result = payload as DbEvidencePage;
    const total = Number(result.total);
    if (
      !Number.isSafeInteger(total) ||
      total < 0 ||
      result.page !== data.page ||
      result.pageSize !== 25 ||
      !Array.isArray(result.rows) ||
      result.rows.length > 25
    )
      throw new Error("The evidence pagination response is invalid.");

    const cases: AiWorkpaperReviewSource[] = result.rows.map((r) => ({
      id: r.review_id,
      journal_id: r.journal_id,
      status: r.review_status,
      assigned_to: null,
      reviewed_by: r.reviewed_by,
      reviewed_at: r.reviewed_at,
      updated_at: r.updated_at,
    }));
    const journals: AiWorkpaperJournalSource[] = result.rows.map((r) => ({
      id: r.journal_id,
      journal_number: r.journal_number,
      journal_date: r.journal_date,
      status: r.journal_status,
      source_type: r.source_type,
    }));
    const links = linkAiReviewsToWorkpaper(
      cases,
      journals,
      result.rows.map((r) => r.journal_id),
      data.asOf,
    );
    return {
      accountId: data.accountId,
      asOf: data.asOf,
      page: data.page,
      pageSize: result.pageSize,
      total,
      links,
      pageCounts: countAiWorkpaperEvidence(links),
      disclaimer:
        "This page shows recorded AI review cases linked to the selected account. AI sign-off is not a workpaper sign-off, bank reconciliation, journal approval, or proof that all ledger movements were checked.",
    };
  });
