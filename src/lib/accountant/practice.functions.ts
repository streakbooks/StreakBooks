import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import {
  isoDate,
  taskPayload,
  type PracticeTask,
  type PracticeWorkspace,
  type PracticeClient,
} from "./practice-work";

const scope = z.union([
  z.object({
    companyId: z.string().uuid(),
    firmId: z.undefined().optional(),
    page: z.number().int().min(0).max(100000).default(0),
  }),
  z.object({
    firmId: z.string().uuid(),
    companyId: z.undefined().optional(),
    page: z.number().int().min(0).max(100000).default(0),
  }),
]);
export const listPracticeWork = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => scope.parse(input))
  .handler(async ({ data, context }): Promise<PracticeWorkspace> => {
    const sb = context.supabase;
    let clients: PracticeClient[] = [];
    if (data.companyId) {
      await assertCompanyPermission(sb, data.companyId, "accounting.view");
      const { data: company, error } = await sb
        .from("companies")
        .select("id,name")
        .eq("id", data.companyId)
        .single();
      if (error) throw new Error(error.message);
      const manage = await sb.rpc("has_company_permission", {
        _company_id: data.companyId,
        _permission: "accounting.post",
      });
      if (manage.error) throw new Error(manage.error.message);
      clients = [{ id: company.id, name: company.name, canManage: Boolean(manage.data) }];
    } else {
      const { data: member, error } = await sb
        .from("firm_members" as never)
        .select("id" as never)
        .eq("firm_id" as never, data.firmId as never)
        .eq("user_id" as never, context.userId as never)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!member) throw new Error("Firm membership required");
      // Explicitly bound portfolios; never show a misleading complete portfolio after truncation.
      const { data: links, error: linkError } = await sb
        .from("firm_client_links" as never)
        .select("company_id,companies(name)" as never)
        .eq("firm_id" as never, data.firmId as never)
        .is("revoked_at" as never, null)
        .order("company_id" as never)
        .limit(201);
      if (linkError) throw new Error(linkError.message);
      const rows = (links ?? []) as Array<{
        company_id: string;
        companies: { name: string } | null;
      }>;
      if (rows.length > 200)
        throw new Error(
          "This portfolio exceeds 200 clients; use the client organisation workspace to review work",
        );
      for (let i = 0; i < rows.length; i += 10) {
        const batch = await Promise.all(
          rows.slice(i, i + 10).map(async (row) => {
            const [view, manage] = await Promise.all([
              sb.rpc("has_company_permission", {
                _company_id: row.company_id,
                _permission: "accounting.view",
              }),
              sb.rpc("has_company_permission", {
                _company_id: row.company_id,
                _permission: "accounting.post",
              }),
            ]);
            if (view.error || manage.error)
              throw new Error(view.error?.message ?? manage.error!.message);
            return view.data
              ? {
                  id: row.company_id,
                  name: row.companies?.name ?? "Client organisation",
                  canManage: Boolean(manage.data),
                }
              : null;
          }),
        );
        clients.push(...batch.filter((c): c is PracticeClient => c !== null));
      }
    }
    if (!clients.length)
      return { clients, tasks: [], hasMore: false, page: data.page, userId: context.userId };
    const { data: tasks, error } = await sb
      .from("practice_tasks" as never)
      .select(
        "id,company_id,title,kind,period_end,due_date,status,assignee_id,note,version,prepared_by,reviewed_by,completed_at,updated_at" as never,
      )
      .in("company_id" as never, clients.map((c) => c.id) as never)
      .order("due_date" as never)
      .order("id" as never)
      .range(data.page * 200, data.page * 200 + 200);
    if (error)
      throw new Error(
        error.message.includes("practice_tasks")
          ? "Practice workflows need the latest database migration. Refresh after it has been applied."
          : error.message,
      );
    return {
      clients,
      tasks: ((tasks ?? []) as PracticeTask[]).slice(0, 200),
      hasMore: (tasks ?? []).length > 200,
      page: data.page,
      userId: context.userId,
    };
  });
export const savePracticeTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ companyId: z.string().uuid(), payload: taskPayload }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.post");
    const { data: task, error } = await context.supabase.rpc(
      "save_practice_task" as never,
      { _company_id: data.companyId, _payload: data.payload } as never,
    );
    if (error) throw new Error(error.message);
    return task as PracticeTask;
  });
export const bulkPracticeTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        items: z
          .array(
            z.object({
              id: z.string().uuid(),
              company_id: z.string().uuid(),
              version: z.number().int().positive(),
            }),
          )
          .min(1)
          .max(100),
        status: z.enum(["in_progress", "blocked", "ready", "completed"]),
        note: z.string().trim().min(3).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: count, error } = await context.supabase.rpc(
      "bulk_practice_tasks" as never,
      { _items: data.items, _status: data.status, _note: data.note } as never,
    );
    if (error) throw new Error(error.message);
    return { updated: Number(count) };
  });
export const createMonthEndWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        companyIds: z.array(z.string().uuid()).min(1).max(20),
        periodEnd: isoDate,
        dueDate: isoDate,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const outcomes: Array<{ companyId: string; created: number; error: string | null }> = [];
    for (const companyId of new Set(data.companyIds)) {
      const { data: created, error } = await context.supabase.rpc(
        "create_month_end_work" as never,
        { _company_id: companyId, _period_end: data.periodEnd, _due_date: data.dueDate } as never,
      );
      outcomes.push({ companyId, created: Number(created ?? 0), error: error?.message ?? null });
    }
    return outcomes;
  });
export const listPracticeAssignees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ companyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: members, error } = await context.supabase.rpc(
      "practice_assignees" as never,
      { _company_id: data.companyId } as never,
    );
    if (error) throw new Error(error.message);
    return (members ?? []) as Array<{ user_id: string; name: string }>;
  });
