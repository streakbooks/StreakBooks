import { hasAsciiControlCharacters } from "@/lib/text-validation";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import type {
  ReconciliationReviewAction,
  ReconciliationReviewEvent,
  ReconciliationCaseStatus,
} from "./reconciliation-review";

const ACTIONS: readonly ReconciliationReviewAction[] = [
  "attach_evidence",
  "submit",
  "sign_off",
  "reopen",
];

/** On-demand bounded review event list. It is an audit history sample, not
 * evidence that an accounting source has been remediated.
 */
export const listReconciliationReviewHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; caseId: string }) => ({
    companyId: assertUuid(input?.companyId),
    caseId: assertUuid(input?.caseId, "review case"),
  }))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      events: ReconciliationReviewEvent[];
      hasMore: boolean;
    }> => {
      await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
      const sb = context.supabase;
      // Confirm selected case and tenant before revealing its event history.
      const { data: selected, error: caseError } = await sb
        .from("reconciliation_review_cases" as never)
        .select("id,company_id" as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("id" as never, data.caseId as never)
        .maybeSingle();
      if (caseError) throw new Error(caseError.message);
      if (!selected) throw new Error("Review case not found in this organisation.");
      const selectedCase = selected as unknown as { id: string; company_id: string };
      if (selectedCase.company_id !== data.companyId || selectedCase.id !== data.caseId) {
        throw new Error("Review case does not belong to this organisation.");
      }
      const { data: records, error } = await sb
        .from("reconciliation_review_events" as never)
        .select(
          "id,company_id,case_id,actor_id,action,note,old_state,new_state,created_at" as never,
        )
        .eq("company_id" as never, data.companyId as never)
        .eq("case_id" as never, data.caseId as never)
        .order("created_at" as never, { ascending: false })
        .limit(101);
      if (error) throw new Error(error.message);
      const rows = (records ?? []) as unknown as ReconciliationReviewEvent[];
      if (rows.some((row) => row.company_id !== data.companyId || row.case_id !== data.caseId)) {
        throw new Error("Review history includes evidence from another organisation or case.");
      }
      return { events: rows.slice(0, 100), hasMore: rows.length > 100 };
    },
  );

export type ProgressReconciliationReviewInput = {
  companyId: string;
  caseId: string;
  action: ReconciliationReviewAction;
  expectedVersion: number;
  note: string;
  evidenceUrl?: string | null;
};

/** The DB RPC is the transaction/authorization authority. Clients cannot
 * claim "resolved" or bypass the independent reviewer by calling this function.
 * This is REVIEW ATTESTATION only, not verified source remediation.
 */
export const progressReconciliationReviewCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ProgressReconciliationReviewInput) => {
    if (!ACTIONS.includes(input?.action)) throw new Error("Invalid review progression action.");
    if (!Number.isSafeInteger(input?.expectedVersion) || input.expectedVersion < 1) {
      throw new Error("Current positive review version required.");
    }
    if (typeof input?.note !== "string" || input.note.length > 2000) {
      throw new Error("Review conclusion must be a string of at most 2000 characters.");
    }
    const evidenceUrl = input.evidenceUrl?.trim() || null;
    if (
      evidenceUrl &&
      (evidenceUrl.length > 500 ||
        !/^https:\/\/[^\s]+$/.test(evidenceUrl) ||
        hasAsciiControlCharacters(evidenceUrl))
    ) {
      throw new Error("Supporting evidence must be an HTTPS URL, max 500 characters.");
    }
    if (
      input.action === "attach_evidence"
        ? !evidenceUrl || input.note.trim().length < 3
        : evidenceUrl != null || input.note.trim().length < 10
    ) {
      throw new Error("Evidence or conclusion is missing for this review action.");
    }
    return {
      companyId: assertUuid(input.companyId),
      caseId: assertUuid(input.caseId, "review case"),
      action: input.action,
      expectedVersion: input.expectedVersion,
      note: input.note.trim(),
      evidenceUrl,
    };
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      id: string;
      status: ReconciliationCaseStatus;
      version: number;
      assigned_to: string | null;
      updated_at: string;
      evidence_url: string | null;
      submitted_by: string | null;
      reviewed_by: string | null;
    }> => {
      await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
      await assertCompanyPermission(context.supabase, data.companyId, "accounting.post");
      const { data: saved, error } = await context.supabase.rpc(
        "progress_reconciliation_review_case" as never,
        {
          _company_id: data.companyId,
          _case_id: data.caseId,
          _action: data.action,
          _expected_version: data.expectedVersion,
          _note: data.note,
          _evidence_url: data.evidenceUrl,
        } as never,
      );
      if (error) throw new Error(error.message);
      if (!saved || typeof saved !== "object") {
        throw new Error("Review progression returned no versioned evidence.");
      }
      return saved as {
        id: string;
        status: ReconciliationCaseStatus;
        version: number;
        assigned_to: string | null;
        updated_at: string;
        evidence_url: string | null;
        submitted_by: string | null;
        reviewed_by: string | null;
      };
    },
  );
