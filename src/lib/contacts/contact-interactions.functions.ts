import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import {
  normalizeContactTimelineFilter,
  normalizeContactFollowUpScope,
  contactFollowUpDateRange,
  validateContactInteractionDraft,
  type ContactTimelineFilter,
  type ContactFollowUpScope,
} from "@/lib/contacts/contact-interactions";

const PAGE_LIMIT = 25;

export const listContactInteractions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      contactId: string;
      page?: number;
      filter?: ContactTimelineFilter;
    }) => ({
      companyId: assertUuid(input.companyId),
      contactId: assertUuid(input.contactId),
      page: Math.min(4000, Math.max(0, Math.floor(Number(input.page ?? 0) || 0))),
      filter: normalizeContactTimelineFilter(input.filter),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: contact, error: contactError } = await context.supabase
      .from("contacts" as never)
      .select("id" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.contactId as never)
      .maybeSingle();
    if (contactError) throw new Error(contactError.message);
    if (!contact) throw new Error("Contact not found in this organisation");

    let query = context.supabase
      .from("contact_interactions" as never)
      .select(
        "id,kind,title,detail,due_on,remind_on,assigned_to,completed_at,occurred_at,created_at,created_by" as never,
        { count: "exact" },
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("contact_id" as never, data.contactId as never)
      .order("occurred_at" as never, { ascending: false })
      .order("id" as never)
      .range(data.page * PAGE_LIMIT, (data.page + 1) * PAGE_LIMIT - 1);
    if (data.filter === "open_tasks") {
      query = query.eq("kind" as never, "task" as never).is("completed_at" as never, null as never);
    } else if (data.filter === "completed_tasks") {
      query = query
        .eq("kind" as never, "task" as never)
        .not("completed_at" as never, "is" as never, null as never);
    }
    const { data: rows, count, error } = await query;
    if (error) throw new Error(error.message);
    const activities = (rows ?? []) as unknown as Array<Record<string, unknown>>;
    return {
      rows: activities.map((activity) => ({
        ...activity,
        is_mine: activity["assigned_to"] === context.userId,
      })),
      count: count ?? 0,
      page: data.page,
      pageSize: PAGE_LIMIT,
    };
  });

export const createContactInteraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      contactId: string;
      kind: string;
      title: string;
      detail?: string;
      dueOn?: string | null;
      remindOn?: string | null;
      assignedTo?: string | null;
    }) => ({
      companyId: assertUuid(input.companyId),
      contactId: assertUuid(input.contactId),
      ...validateContactInteractionDraft(input),
      assignedTo: input.assignedTo ? assertUuid(input.assignedTo) : null,
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "contacts.manage");
    const { data: contact, error: contactError } = await context.supabase
      .from("contacts" as never)
      .select("id" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.contactId as never)
      .eq("is_active" as never, true as never)
      .is("archived_at" as never, null as never)
      .maybeSingle();
    if (contactError) throw new Error(contactError.message);
    if (!contact) throw new Error("Only active contacts can receive new activities");

    const { data: created, error } = await context.supabase
      .from("contact_interactions" as never)
      .insert({
        company_id: data.companyId,
        contact_id: data.contactId,
        kind: data.kind,
        title: data.title,
        detail: data.detail,
        due_on: data.dueOn,
        remind_on: data.remindOn,
        assigned_to: data.kind === "task" ? data.assignedTo : null,
      } as never)
      .select("id" as never)
      .single();
    if (error) throw new Error(error.message);
    return { id: (created as { id: string }).id };
  });

export const setContactTaskCompleted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; contactId: string; activityId: string; completed: boolean }) => {
      if (typeof input.completed !== "boolean") throw new Error("Invalid task completion status");
      return {
        companyId: assertUuid(input.companyId),
        contactId: assertUuid(input.contactId),
        activityId: assertUuid(input.activityId),
        completed: input.completed,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: existing, error: lookupError } = await context.supabase
      .from("contact_interactions" as never)
      .select("assigned_to" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("contact_id" as never, data.contactId as never)
      .eq("id" as never, data.activityId as never)
      .eq("kind" as never, "task" as never)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (!existing) throw new Error("Task not found in this organisation");
    if ((existing as { assigned_to: string | null }).assigned_to !== context.userId) {
      await assertCompanyPermission(context.supabase, data.companyId, "contacts.manage");
    }
    const { data: row, error } = await context.supabase
      .from("contact_interactions" as never)
      .update({ completed_at: data.completed ? new Date().toISOString() : null } as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("contact_id" as never, data.contactId as never)
      .eq("id" as never, data.activityId as never)
      .eq("kind" as never, "task" as never)
      .select("id,completed_at" as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Task not found in this organisation");
    const task = row as { id: string; completed_at: string | null };
    return { id: task.id, completedAt: task.completed_at };
  });

/** Managers can assign follow-ups only to active colleagues in the same company. */
export const listContactTaskAssignees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: assertUuid(input.companyId),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: members, error } = await context.supabase
      .from("company_members" as never)
      .select("user_id,role" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("status" as never, "active" as never)
      .order("created_at" as never);
    if (error) throw new Error(error.message);
    const rows = (members ?? []) as Array<{ user_id: string; role: string }>;
    const ids = rows.map((member) => member.user_id);
    const { data: profiles, error: profileError } = ids.length
      ? await context.supabase
          .from("profiles" as never)
          .select("id,full_name,email" as never)
          .in("id" as never, ids as never)
      : { data: [], error: null };
    if (profileError) throw new Error(profileError.message);
    const byId = new Map(
      ((profiles ?? []) as Array<{ id: string; full_name: string; email: string }>).map(
        (profile) => [profile.id, profile],
      ),
    );
    return {
      selfId: context.userId,
      members: rows.map((member) => ({
        id: member.user_id,
        name:
          byId.get(member.user_id)?.full_name ||
          byId.get(member.user_id)?.email ||
          `Team member (${member.role})`,
      })),
    };
  });

/** Reassignment and reminder scheduling are independent of the immutable task text. */
export const updateContactTaskReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      contactId: string;
      taskId: string;
      assignedTo?: string | null;
      remindOn?: string | null;
    }) => ({
      companyId: assertUuid(input.companyId),
      contactId: assertUuid(input.contactId),
      taskId: assertUuid(input.taskId),
      assignedTo: input.assignedTo ? assertUuid(input.assignedTo) : null,
      remindOn: input.remindOn ?? null,
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "contacts.manage");
    const { data: task, error: findError } = await context.supabase
      .from("contact_interactions" as never)
      .select("id,due_on" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("contact_id" as never, data.contactId as never)
      .eq("kind" as never, "task" as never)
      .eq("id" as never, data.taskId as never)
      .maybeSingle();
    if (findError) throw new Error(findError.message);
    if (!task) throw new Error("Task not found in this organisation");
    const validated = validateContactInteractionDraft({
      kind: "task",
      title: "Update assignment",
      dueOn: (task as { due_on: string | null }).due_on,
      remindOn: data.remindOn,
    });
    if (data.assignedTo) {
      const { data: member, error: memberError } = await context.supabase
        .from("company_members" as never)
        .select("user_id" as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("user_id" as never, data.assignedTo as never)
        .eq("status" as never, "active" as never)
        .maybeSingle();
      if (memberError) throw new Error(memberError.message);
      if (!member) throw new Error("Choose an active team member in this organisation");
    }
    const { data: updated, error } = await context.supabase
      .from("contact_interactions" as never)
      .update({ assigned_to: data.assignedTo, remind_on: validated.remindOn } as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("contact_id" as never, data.contactId as never)
      .eq("id" as never, data.taskId as never)
      .eq("kind" as never, "task" as never)
      .select("id,assigned_to,remind_on" as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Task could not be updated");
    return updated;
  });

/**
 * In-app reminder queue, evaluated on each read in the company timezone.
 * Includes open tasks due within seven days OR whose optional reminder date
 * has arrived. This does not send emails or create recurring jobs.
 */
export const listContactFollowUps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; scope?: ContactFollowUpScope; page?: number }) => ({
    companyId: assertUuid(input.companyId),
    scope: normalizeContactFollowUpScope(input.scope),
    page: Math.min(4000, Math.max(0, Math.floor(Number(input.page ?? 0) || 0))),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: company, error: companyError } = await context.supabase
      .from("companies" as never)
      .select("timezone" as never)
      .eq("id" as never, data.companyId as never)
      .maybeSingle();
    if (companyError) throw new Error(companyError.message);
    if (!company) throw new Error("Organisation not found");
    const { today, until } = contactFollowUpDateRange(
      new Date(),
      (company as { timezone: string }).timezone || "UTC",
    );
    let query = context.supabase
      .from("contact_interactions" as never)
      .select("id,contact_id,title,due_on,remind_on,assigned_to" as never, {
        count: "exact",
      })
      .eq("company_id" as never, data.companyId as never)
      .eq("kind" as never, "task" as never)
      .is("completed_at" as never, null as never)
      .or(`due_on.lte.${until},remind_on.lte.${today}`)
      .order("due_on" as never, { ascending: true, nullsFirst: false })
      .order("id" as never)
      .range(data.page * PAGE_LIMIT, (data.page + 1) * PAGE_LIMIT - 1);
    if (data.scope === "mine") {
      query = query.eq("assigned_to" as never, context.userId as never);
    }
    const { data: rows, count, error } = await query;
    if (error) throw new Error(error.message);
    const tasks = (rows ?? []) as Array<{
      id: string;
      contact_id: string;
      title: string;
      due_on: string | null;
      remind_on: string | null;
      assigned_to: string | null;
    }>;
    const contactIds = [...new Set(tasks.map((task) => task.contact_id))];
    const { data: contacts, error: contactsError } = contactIds.length
      ? await context.supabase
          .from("contacts" as never)
          .select("id,name" as never)
          .eq("company_id" as never, data.companyId as never)
          .in("id" as never, contactIds as never)
      : { data: [], error: null };
    if (contactsError) throw new Error(contactsError.message);
    const names = new Map(
      ((contacts ?? []) as Array<{ id: string; name: string }>).map((contact) => [
        contact.id,
        contact.name,
      ]),
    );
    return {
      rows: tasks.map((task) => ({
        ...task,
        contact_name: names.get(task.contact_id) ?? "Contact",
      })),
      count: count ?? 0,
      page: data.page,
      pageSize: PAGE_LIMIT,
      today,
      until,
    };
  });
