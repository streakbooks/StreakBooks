import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { isoDate } from "@/lib/accountant/practice-work";

const firmClientScope = z
  .object({ firmId: z.string().uuid(), companyId: z.string().uuid() })
  .strict();

export const ONBOARDING_TEMPLATE = [
  { key: "client_details", title: "Confirm client details and primary contact" },
  { key: "engagement", title: "Agree scope and engagement terms" },
  { key: "access", title: "Verify client organisation and staff access" },
  { key: "opening_records", title: "Collect and review opening records" },
  { key: "opening_review", title: "Complete initial bookkeeping review" },
] as const;

export const OFFBOARDING_TEMPLATE = [
  { key: "offboard_work", title: "Offboarding — finish open engagements and work" },
  { key: "offboard_records", title: "Offboarding — prepare records and document handover" },
  { key: "offboard_balances", title: "Offboarding — confirm final balances and deliverables" },
  { key: "offboard_approval", title: "Offboarding — obtain handover acknowledgement" },
  { key: "offboard_access", title: "Offboarding — review all retained company access" },
] as const;

export type FirmOnboardingStep = {
  firm_id: string;
  company_id: string;
  task_key: string;
  title: string;
  note: string;
  completed_at: string | null;
  completed_by: string | null;
  assignee_id: string | null;
  due_date: string | null;
  depends_on_task_key: string | null;
  reminders_enabled: boolean;
  version: number;
  updated_at: string;
};

const onboardingProjection =
  "firm_id,company_id,task_key,title,note,completed_at,completed_by,assignee_id,due_date,depends_on_task_key,reminders_enabled,version,updated_at";

export type FirmOnboardingOverviewRow = Pick<
  FirmOnboardingStep,
  "company_id" | "task_key" | "title" | "completed_at" | "assignee_id" | "due_date" | "depends_on_task_key"
>;

export type FirmEngagement = {
  id: string;
  firm_id: string;
  company_id: string;
  name: string;
  status: "draft" | "active" | "paused" | "completed" | "cancelled";
  frequency: "one_off" | "monthly" | "quarterly" | "annual";
  start_date: string;
  end_date: string | null;
  agreed_fee: string | number | null;
  currency_code: string;
  notes: string;
  version: number;
  updated_at: string;
};

export const engagementInput = firmClientScope
  .extend({
    id: z.string().uuid().optional(),
    version: z.number().int().positive().optional(),
    name: z.string().trim().min(2).max(150),
    status: z.enum(["draft", "active", "paused", "completed", "cancelled"]),
    frequency: z.enum(["one_off", "monthly", "quarterly", "annual"]),
    start_date: isoDate,
    end_date: isoDate.nullable(),
    agreed_fee: z
      .string()
      .regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/)
      .nullable(),
    currency_code: z.string().regex(/^(?:[A-Z]{3})?$/),
    notes: z.string().trim().max(3000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.id && !value.version)
      ctx.addIssue({ code: "custom", message: "Refresh this engagement before editing" });
    if (value.end_date && value.end_date < value.start_date)
      ctx.addIssue({ code: "custom", message: "End date cannot precede start date" });
    if ((value.agreed_fee === null) !== (value.currency_code === ""))
      ctx.addIssue({ code: "custom", message: "Set both fee and currency, or leave both blank" });
  });
export type EngagementInput = z.infer<typeof engagementInput>;

async function checkScope(
  context: { supabase: Parameters<typeof assertCompanyPermission>[0]; userId: string },
  firmId: string,
  companyId: string,
  mustManage: boolean,
) {
  const sb = context.supabase;
  const { data: member, error: membershipError } = await sb
    .from("firm_members" as never)
    .select("role" as never)
    .eq("firm_id" as never, firmId as never)
    .eq("user_id" as never, context.userId as never)
    .maybeSingle();
  if (membershipError) throw new Error(membershipError.message);
  if (!member) throw new Error("Firm membership required");
  if (mustManage && !["owner", "admin"].includes((member as { role: string }).role))
    throw new Error("Firm administrator access required");
  const { data: link, error: linkError } = await sb
    .from("firm_client_links" as never)
    .select("id" as never)
    .eq("firm_id" as never, firmId as never)
    .eq("company_id" as never, companyId as never)
    .is("revoked_at" as never, null)
    .maybeSingle();
  if (linkError) throw new Error(linkError.message);
  if (!link) throw new Error("Client is not linked to this firm");
  await assertCompanyPermission(sb, companyId, "accounting.view");
}

export const listFirmOnboardingSteps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => firmClientScope.parse(input))
  .handler(async ({ data, context }): Promise<FirmOnboardingStep[]> => {
    await checkScope(context, data.firmId, data.companyId, false);
    const { data: rows, error } = await context.supabase
      .from("firm_client_onboarding_steps" as never)
      .select(
        onboardingProjection as never,
      )
      .eq("firm_id" as never, data.firmId as never)
      .eq("company_id" as never, data.companyId as never)
      .order("created_at" as never)
      .limit(101);
    if (error) throw new Error(error.message);
    if ((rows ?? []).length > 100) throw new Error("Onboarding checklist exceeds 100 items");
    return (rows ?? []) as FirmOnboardingStep[];
  });

export const initializeFirmOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => firmClientScope.parse(input))
  .handler(async ({ data, context }) => {
    await checkScope(context, data.firmId, data.companyId, true);
    const { error } = await context.supabase.from("firm_client_onboarding_steps" as never).upsert(
      ONBOARDING_TEMPLATE.map((task) => ({
        firm_id: data.firmId,
        company_id: data.companyId,
        task_key: task.key,
        title: task.title,
        updated_by: context.userId,
      })) as never,
      { onConflict: "firm_id,company_id,task_key", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const initializeFirmOffboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => firmClientScope.parse(input))
  .handler(async ({ data, context }) => {
    await checkScope(context, data.firmId, data.companyId, true);
    const { error } = await context.supabase.from("firm_client_onboarding_steps" as never).upsert(
      OFFBOARDING_TEMPLATE.map((step) => ({
        firm_id: data.firmId,
        company_id: data.companyId,
        task_key: step.key,
        title: step.title,
        updated_by: context.userId,
      })) as never,
      { onConflict: "firm_id,company_id,task_key", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const stepUpdate = firmClientScope
  .extend({
    task_key: z.string().min(2).max(48),
    version: z.number().int().positive(),
    note: z.string().trim().max(1000),
    complete: z.boolean(),
  })
  .strict();

export const updateFirmOnboardingStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => stepUpdate.parse(input))
  .handler(async ({ data, context }): Promise<FirmOnboardingStep> => {
    await checkScope(context, data.firmId, data.companyId, true);
    const { data: updated, error } = await context.supabase
      .from("firm_client_onboarding_steps" as never)
      .update({
        note: data.note,
        completed_at: data.complete ? new Date().toISOString() : null,
        completed_by: data.complete ? context.userId : null,
        updated_by: context.userId,
      } as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("task_key" as never, data.task_key as never)
      .eq("version" as never, data.version as never)
      .select(
        onboardingProjection as never,
      )
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated)
      throw new Error("Checklist changed or access was revoked. Refresh before retrying.");
    return updated as FirmOnboardingStep;
  });

export const planningInput = firmClientScope
  .extend({
    task_key: z.string().min(2).max(48),
    version: z.number().int().positive(),
    assignee_id: z.string().uuid().nullable(),
    due_date: isoDate.nullable(),
    depends_on_task_key: z.string().min(2).max(48).nullable(),
    reminders_enabled: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.depends_on_task_key === value.task_key)
      ctx.addIssue({ code: "custom", message: "A checklist step cannot depend on itself" });
  });
export type FirmOnboardingPlanInput = z.infer<typeof planningInput>;

export const saveFirmOnboardingPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => planningInput.parse(input))
  .handler(async ({ data, context }): Promise<FirmOnboardingStep> => {
    await checkScope(context, data.firmId, data.companyId, true);
    const { data: saved, error } = await context.supabase
      .from("firm_client_onboarding_steps" as never)
      .update({
        assignee_id: data.assignee_id,
        due_date: data.due_date,
        depends_on_task_key: data.depends_on_task_key,
        reminders_enabled: data.reminders_enabled,
        updated_by: context.userId,
      } as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("task_key" as never, data.task_key as never)
      .eq("version" as never, data.version as never)
      .select(onboardingProjection as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!saved) throw new Error("Checklist changed or access was revoked. Refresh and retry.");
    return saved as FirmOnboardingStep;
  });

export const listFirmOnboardingOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ firmId: z.string().uuid() }).strict().parse(input),
  )
  .handler(async ({ data, context }): Promise<FirmOnboardingOverviewRow[]> => {
    const { data: membership, error: memberError } = await context.supabase
      .from("firm_members" as never)
      .select("id" as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("user_id" as never, context.userId as never)
      .maybeSingle();
    if (memberError) throw new Error(memberError.message);
    if (!membership) throw new Error("Firm membership required");
    // Database RLS filters independently inaccessible clients. Read in stable
    // pages: PostgREST may cap a single response at 1,000 rows without warning.
    const overview: FirmOnboardingOverviewRow[] = [];
    const pageSize = 200;
    for (let page = 0; page <= 25; page++) {
      const { data: rows, error } = await context.supabase
        .from("firm_client_onboarding_steps" as never)
        .select(
          "company_id,task_key,title,completed_at,assignee_id,due_date,depends_on_task_key" as never,
        )
        .eq("firm_id" as never, data.firmId as never)
        .order("company_id" as never)
        .order("task_key" as never)
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw new Error(error.message);
      const batch = (rows ?? []) as FirmOnboardingOverviewRow[];
      overview.push(...batch);
      if (overview.length > 5000)
        throw new Error("Onboarding portfolio exceeds 5,000 steps; use a client checklist");
      if (batch.length < pageSize) break;
    }
    return overview;
  });

export const listFirmEngagements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => firmClientScope.parse(input))
  .handler(async ({ data, context }): Promise<FirmEngagement[]> => {
    await checkScope(context, data.firmId, data.companyId, false);
    const { data: rows, error } = await context.supabase
      .from("firm_engagements" as never)
      .select(
        "id,firm_id,company_id,name,status,frequency,start_date,end_date,agreed_fee,currency_code,notes,version,updated_at" as never,
      )
      .eq("firm_id" as never, data.firmId as never)
      .eq("company_id" as never, data.companyId as never)
      .order("start_date" as never, { ascending: false })
      .limit(201);
    if (error) throw new Error(error.message);
    if ((rows ?? []).length > 200) throw new Error("Client has more than 200 engagements");
    return (rows ?? []) as FirmEngagement[];
  });

export const saveFirmEngagement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => engagementInput.parse(input))
  .handler(async ({ data, context }): Promise<FirmEngagement> => {
    await checkScope(context, data.firmId, data.companyId, true);
    const { firmId, companyId, id, version, ...fields } = data;
    const columns =
      "id,firm_id,company_id,name,status,frequency,start_date,end_date,agreed_fee,currency_code,notes,version,updated_at";
    if (!id) {
      const { data: created, error } = await context.supabase
        .from("firm_engagements" as never)
        .insert({
          ...fields,
          firm_id: firmId,
          company_id: companyId,
          created_by: context.userId,
          updated_by: context.userId,
        } as never)
        .select(columns as never)
        .single();
      if (error) throw new Error(error.message);
      return created as FirmEngagement;
    }
    const { data: saved, error } = await context.supabase
      .from("firm_engagements" as never)
      .update({ ...fields, updated_by: context.userId } as never)
      .eq("id" as never, id as never)
      .eq("firm_id" as never, firmId as never)
      .eq("company_id" as never, companyId as never)
      .eq("version" as never, version! as never)
      .select(columns as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!saved)
      throw new Error("Engagement changed or access was revoked. Refresh before retrying.");
    return saved as FirmEngagement;
  });

export type FirmTeamMember = {
  user_id: string;
  role: "owner" | "admin" | "member";
  created_at: string;
  full_name: string | null;
  email: string | null;
};

export const listFirmTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ firmId: z.string().uuid() }).strict().parse(input))
  .handler(async ({ data, context }): Promise<FirmTeamMember[]> => {
    const sb = context.supabase;
    const { data: membership, error: memberError } = await sb
      .from("firm_members" as never)
      .select("id" as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("user_id" as never, context.userId as never)
      .maybeSingle();
    if (memberError) throw new Error(memberError.message);
    if (!membership) throw new Error("Firm membership required");
    const { data: rows, error } = await sb
      .from("firm_members" as never)
      .select("user_id,role,created_at" as never)
      .eq("firm_id" as never, data.firmId as never)
      .limit(201);
    if (error) throw new Error(error.message);
    if ((rows ?? []).length > 200) throw new Error("Firm staff directory exceeds 200 people");
    const team = (rows ?? []) as Array<{
      user_id: string;
      role: FirmTeamMember["role"];
      created_at: string;
    }>;
    if (!team.length) return [];
    // Profiles RLS only reveals details to an independently authorised colleague.
    const { data: people, error: profilesError } = await sb
      .from("profiles")
      .select("id,full_name,email")
      .in(
        "id",
        team.map((row) => row.user_id),
      );
    if (profilesError) throw new Error(profilesError.message);
    const names = new Map((people ?? []).map((p) => [p.id, p]));
    return team.map((member) => ({
      ...member,
      full_name: names.get(member.user_id)?.full_name ?? null,
      email: names.get(member.user_id)?.email ?? null,
    }));
  });
