import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import {
  normalizeContactTimelineFilter,
  validateContactInteractionDraft,
  type ContactTimelineFilter,
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
        "id,kind,title,detail,due_on,completed_at,occurred_at,created_at,created_by" as never,
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
    return { rows: rows ?? [], count: count ?? 0, page: data.page, pageSize: PAGE_LIMIT };
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
    }) => ({
      companyId: assertUuid(input.companyId),
      contactId: assertUuid(input.contactId),
      ...validateContactInteractionDraft(input),
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
    await assertCompanyPermission(context.supabase, data.companyId, "contacts.manage");
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
