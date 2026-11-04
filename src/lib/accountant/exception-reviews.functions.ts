import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";

const companyId = z.string().uuid();
const journalId = z.string().uuid();
const findingKey = z.string().min(40).max(180).regex(/^[a-z0-9:_-]+$/);

const listInput = z.object({
  companyId,
  journalIds: z.array(journalId).min(1).max(500),
});

export type AccountantExceptionReview = {
  id: string;
  company_id: string;
  journal_id: string;
  finding_key: string;
  status: "investigating" | "ready_for_review" | "reviewed";
  note: string;
  prepared_by: string | null;
  reviewed_by: string | null;
  version: number;
  updated_at: string;
};

export type AccountantExceptionEvent = {
  id: string;
  action: "investigate" | "submit" | "approve" | "reopen";
  actor_id: string;
  note: string;
  created_at: string;
};

/** Only findings for the selected company and scanned journal set are returned. */
export const listAccountantExceptionReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listInput.parse(input))
  .handler(async ({ data, context }): Promise<AccountantExceptionReview[]> => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const { data: rows, error } = await context.supabase
      .from("accountant_journal_exception_reviews" as never)
      .select(
        "id,company_id,journal_id,finding_key,status,note,prepared_by,reviewed_by,version,updated_at" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .in("journal_id" as never, data.journalIds as never)
      .order("updated_at" as never, { ascending: false } as never)
      .limit(5000);
    if (error) {
      throw new Error(
        error.code === "42P01" || error.message.includes("accountant_journal_exception_reviews")
          ? "Accountant exception reviews require the latest database migration."
          : error.message,
      );
    }
    return (rows ?? []) as AccountantExceptionReview[];
  });

export const listAccountantExceptionEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ companyId, reviewId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<AccountantExceptionEvent[]> => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const { data: rows, error } = await context.supabase
      .from("accountant_journal_exception_events" as never)
      .select("id,action,actor_id,note,created_at" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("review_id" as never, data.reviewId as never)
      .order("created_at" as never, { ascending: false } as never)
      .limit(100);
    if (error) throw new Error(error.message);
    return (rows ?? []) as AccountantExceptionEvent[];
  });

const mutationInput = z
  .object({
    companyId,
    journalId,
    findingKey,
    action: z.enum(["investigate", "submit", "approve", "reopen"]),
    note: z.string().max(2000),
    version: z.number().int().positive().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.findingKey.startsWith(value.journalId + ":"))
      ctx.addIssue({ code: "custom", message: "Finding does not match journal." });
    if (value.action !== "investigate" && value.version === null)
      ctx.addIssue({ code: "custom", message: "Save the investigation before review." });
    if (value.action !== "investigate" && value.note.trim().length < 3)
      ctx.addIssue({ code: "custom", message: "Write a review reason of at least 3 characters." });
  });

export const saveAccountantExceptionReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => mutationInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string; status: string; version: number }> => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.post");
    const { data: result, error } = await context.supabase.rpc(
      "save_accountant_journal_exception" as never,
      {
        _company_id: data.companyId,
        _journal_id: data.journalId,
        _finding_key: data.findingKey,
        _action: data.action,
        _note: data.note,
        _expected_version: data.version,
      } as never,
    );
    if (error) throw new Error(error.message);
    return result as { id: string; status: string; version: number };
  });
