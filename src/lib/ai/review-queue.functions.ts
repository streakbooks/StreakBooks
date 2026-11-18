import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";

const uuid = z.string().uuid();
const scope = z.object({ companyId: uuid }).strict();

export type AiJournalReviewCase = {
  id: string;
  company_id: string;
  journal_id: string;
  created_by: string;
  assigned_to: string | null;
  status: "open" | "assigned" | "reviewed" | "reopened";
  version: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  is_assigned_to_me: boolean;
  is_my_case: boolean;
};
export type AiJournalReviewEvent = {
  id: string;
  action: "open" | "assign" | "comment" | "sign_off" | "reopen";
  actor_id: string;
  note: string;
  previous_status: string | null;
  new_status: string;
  assigned_to: string | null;
  created_at: string;
};
export type AiReviewerCandidate = {
  user_id: string;
  label: string;
  role: string;
};
export const reviewActionSchema = z
  .object({
    companyId: uuid,
    journalId: uuid,
    caseId: uuid.nullable(),
    action: z.enum(["open", "assign", "comment", "sign_off", "reopen"]),
    note: z.string().trim().max(2000),
    assignedTo: uuid.nullable(),
    expectedVersion: z.number().int().positive().nullable(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.action === "open" &&
      (data.caseId !== null || data.expectedVersion !== null || data.assignedTo !== null)
    )
      ctx.addIssue({
        code: "custom",
        message: "A new case cannot already have an ID, version or assigned reviewer.",
      });
    if (data.action !== "open" && (data.caseId === null || data.expectedVersion === null))
      ctx.addIssue({ code: "custom", message: "Refresh the existing review before changing it." });
    if (data.action === "assign" && data.assignedTo === null)
      ctx.addIssue({ code: "custom", message: "Select a reviewer to assign." });
    if (["sign_off", "reopen"].includes(data.action) && data.note.length < 10)
      ctx.addIssue({ code: "custom", message: "Write a review reason of at least 10 characters." });
    if (data.action === "comment" && data.note.length < 2)
      ctx.addIssue({ code: "custom", message: "Enter a comment of at least two characters." });
  });

async function canView(client: Parameters<typeof assertCompanyPermission>[0], companyId: string) {
  await assertCompanyPermission(client, companyId, "ai.use");
  await assertCompanyPermission(client, companyId, "reports.view");
}

/** Latest cases, with stable pagination; no unbounded organization-wide scan. */
export const listAiJournalReviewCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    scope
      .extend({
        page: z.number().int().min(0).max(10000).default(0),
        status: z.enum(["all", "open", "assigned", "reviewed", "reopened"]).default("all"),
        assignedToMe: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ rows: AiJournalReviewCase[]; total: number }> => {
    await canView(context.supabase, data.companyId);
    let query = context.supabase
      .from("ai_journal_review_cases" as never)
      .select(
        "id,company_id,journal_id,created_by,assigned_to,status,version,reviewed_by,reviewed_at,created_at,updated_at" as never,
        { count: "exact" },
      )
      .eq("company_id" as never, data.companyId as never);
    if (data.status !== "all") query = query.eq("status" as never, data.status as never);
    if (data.assignedToMe) query = query.eq("assigned_to" as never, context.userId as never);
    const {
      data: rows,
      count,
      error,
    } = await query
      .order("updated_at" as never, { ascending: false })
      .order("id" as never, { ascending: false })
      .range(data.page * 25, data.page * 25 + 24);
    if (error)
      throw new Error(
        "AI review queue is unavailable. Check the review queue migration and permissions.",
      );
    return {
      rows: ((rows ?? []) as Omit<AiJournalReviewCase, "is_assigned_to_me" | "is_my_case">[]).map(
        (row) => ({
          ...row,
          is_assigned_to_me: row.assigned_to === context.userId,
          is_my_case: row.created_by === context.userId,
        }),
      ),
      total: count ?? 0,
    };
  });

/** One tenant-scoped review case for workpaper-to-AI deep links, independent of queue page. */
export const getAiJournalReviewCase = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scope.extend({ caseId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<AiJournalReviewCase> => {
    await canView(context.supabase, data.companyId);
    const { data: row, error } = await context.supabase
      .from("ai_journal_review_cases" as never)
      .select(
        "id,company_id,journal_id,created_by,assigned_to,status,version,reviewed_by,reviewed_at,created_at,updated_at" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.caseId as never)
      .maybeSingle();
    if (error || !row) throw new Error("AI review case not found or not accessible.");
    const record = row as Omit<AiJournalReviewCase, "is_assigned_to_me" | "is_my_case">;
    return {
      ...record,
      is_assigned_to_me: record.assigned_to === context.userId,
      is_my_case: record.created_by === context.userId,
    };
  });

export const listAiJournalReviewEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scope.extend({ caseId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<AiJournalReviewEvent[]> => {
    await canView(context.supabase, data.companyId);
    const { data: belongs, error: caseError } = await context.supabase
      .from("ai_journal_review_cases" as never)
      .select("id" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.caseId as never)
      .maybeSingle();
    if (caseError || !belongs) throw new Error("Review case not accessible.");
    const { data: events, error } = await context.supabase
      .from("ai_journal_review_events" as never)
      .select("id,action,actor_id,note,previous_status,new_status,assigned_to,created_at" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("case_id" as never, data.caseId as never)
      .order("created_at" as never, { ascending: false })
      .order("id" as never, { ascending: false })
      .limit(100);
    if (error) throw new Error("Could not load the review history.");
    return (events ?? []) as AiJournalReviewEvent[];
  });

/**
 * Complete case-specific audit history for authorised exports.
 * Never export a silently truncated history; no write or approval actions.
 */
export const exportAiJournalReviewAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scope.extend({ caseId: uuid }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      review: AiJournalReviewCase;
      events: AiJournalReviewEvent[];
    }> => {
      await canView(context.supabase, data.companyId);
      await assertCompanyPermission(context.supabase, data.companyId, "reports.export");
      const { data: row, error: readError } = await context.supabase
        .from("ai_journal_review_cases" as never)
        .select(
          "id,company_id,journal_id,created_by,assigned_to,status,version,reviewed_by,reviewed_at,created_at,updated_at" as never,
        )
        .eq("company_id" as never, data.companyId as never)
        .eq("id" as never, data.caseId as never)
        .maybeSingle();
      if (readError || !row) throw new Error("AI review case not found or not accessible.");
      const record = row as Omit<AiJournalReviewCase, "is_assigned_to_me" | "is_my_case">;

      // PostgREST APIs can enforce a maximum returned row count. Read
      // explicit 200-row windows rather than trusting one 5,001-row limit.
      // No page is silently dropped; histories above 5,000 are refused.
      const auditEvents: AiJournalReviewEvent[] = [];
      for (let offset = 0; offset <= 5000; offset += 200) {
        const { data: batch, error: eventsError } = await context.supabase
          .from("ai_journal_review_events" as never)
          .select(
            "id,action,actor_id,note,previous_status,new_status,assigned_to,created_at" as never,
          )
          .eq("company_id" as never, data.companyId as never)
          .eq("case_id" as never, data.caseId as never)
          .order("created_at" as never, { ascending: true })
          .order("id" as never, { ascending: true })
          .range(offset, offset + 199);
        if (eventsError)
          throw new Error("Could not retrieve the complete AI review audit history.");
        auditEvents.push(...((batch ?? []) as AiJournalReviewEvent[]));
        if (auditEvents.length > 5000)
          throw new Error(
            "Audit history exceeds 5,000 events. Export in smaller archival segments is required; no incomplete file was generated.",
          );
        if ((batch ?? []).length < 200) break;
      }

      // A competing reviewer may add new events during a multi-page export.
      // Reject a stale export rather than presenting it as a fixed snapshot.
      const { data: latest, error: versionError } = await context.supabase
        .from("ai_journal_review_cases" as never)
        .select("version" as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("id" as never, data.caseId as never)
        .maybeSingle();
      if (versionError || !latest || (latest as { version: number }).version !== record.version)
        throw new Error("The AI review changed during audit export. Refresh and export again.");

      return {
        review: {
          ...record,
          is_assigned_to_me: record.assigned_to === context.userId,
          is_my_case: record.created_by === context.userId,
        },
        events: auditEvents,
      };
    },
  );

/**
 * Directory is only exposed to users already permitted to manage and see members.
 * The database RPC checks effective reviewer permissions again when assigning.
 */
export const listAiJournalReviewerCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scope.parse(input))
  .handler(async ({ data, context }): Promise<AiReviewerCandidate[]> => {
    await canView(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "ai.apply_suggestion");
    await assertCompanyPermission(context.supabase, data.companyId, "members.view");
    const { data: members, error } = await context.supabase
      .from("company_members" as never)
      .select("user_id,role" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("status" as never, "active" as never)
      .order("created_at" as never)
      .limit(201);
    if (error) throw new Error(error.message);
    if ((members ?? []).length > 200)
      throw new Error("Reviewer directory exceeds 200 active members.");
    const entries = (members ?? []) as Array<{ user_id: string; role: string }>;
    if (entries.length === 0) return [];
    const { data: profiles, error: namesError } = await context.supabase
      .from("profiles")
      .select("id,full_name")
      .in(
        "id",
        entries.map((row) => row.user_id),
      );
    if (namesError) throw new Error(namesError.message);
    const names = new Map((profiles ?? []).map((person) => [person.id, person.full_name]));
    return entries.map((member) => ({
      user_id: member.user_id,
      label: names.get(member.user_id)?.trim() || "Team member " + member.user_id.slice(0, 8),
      role: member.role,
    }));
  });

/** Version-checked, permissioned, transactional transitions with immutable audit events. */
export const saveAiJournalReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reviewActionSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string; status: string; version: number }> => {
    await canView(context.supabase, data.companyId);
    if (["assign", "sign_off", "reopen"].includes(data.action))
      await assertCompanyPermission(context.supabase, data.companyId, "ai.apply_suggestion");
    if (data.action === "assign")
      await assertCompanyPermission(context.supabase, data.companyId, "members.view");

    const { data: result, error } = await context.supabase.rpc(
      "save_ai_journal_review" as never,
      {
        _company_id: data.companyId,
        _journal_id: data.journalId,
        _case_id: data.caseId,
        _action: data.action,
        _note: data.note,
        _assigned_to: data.assignedTo,
        _expected_version: data.expectedVersion,
      } as never,
    );
    if (error) throw new Error(error.message);
    return result as { id: string; status: string; version: number };
  });
