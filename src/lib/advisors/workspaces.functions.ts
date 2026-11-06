import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  mapDeliveryCandidate,
  mapDeliveryTask,
  mapDocumentRequest,
  mapWorkspace,
  mapWorkspaceDetail,
  mapWorkspaceNote,
  type AdvisorsDeliveryCandidate,
  type AdvisorsDeliveryTask,
  type AdvisorsDocumentRequest,
  type AdvisorsWorkspace,
  type AdvisorsWorkspaceDetail,
  type AdvisorsWorkspaceNote,
} from "@/lib/advisors/workspaces";

type RpcClient = {
  rpc: (
    fn: never,
    args?: never,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
};

async function callRpc(client: unknown, fn: string, args?: Record<string, unknown>) {
  const { data, error } = await (client as RpcClient).rpc(fn as never, args as never);
  if (error) {
    const message = error.message ?? "Advisors workspaces request failed.";
    if (
      message.includes("schema cache") ||
      message.includes("Could not find the function") ||
      message.includes("PGRST202")
    ) {
      throw new Error(
        "Advisors workspaces are not available in this database yet. Apply the Advisors SQL migrations (AD-08), then reload the API schema cache and try again.",
      );
    }
    throw new Error(message);
  }
  return data;
}

const reasonSchema = z.string().trim().min(3).max(500);

export const listAdvisorsWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z.enum(["active", "paused", "closed"]).optional(),
        kind: z.enum(["bookkeeping", "coaching"]).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .strict()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<AdvisorsWorkspace[]> => {
    const raw = await callRpc(context.supabase, "platform_advisors_list_workspaces", {
      _status: data.status || null,
      _kind: data.kind || null,
      _limit: data.limit ?? 100,
    });
    return Array.isArray(raw) ? raw.map(mapWorkspace) : [];
  });

export const listAdvisorsDeliveryCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdvisorsDeliveryCandidate[]> => {
    const raw = await callRpc(context.supabase, "platform_advisors_list_delivery_candidates");
    return Array.isArray(raw) ? raw.map(mapDeliveryCandidate) : [];
  });

export const upsertAdvisorsWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        engagementId: z.string().uuid(),
        title: z.string().trim().max(200).optional(),
        objectives: z.string().max(4000).optional(),
        assignedAdvisorId: z.string().uuid().nullable().optional(),
        status: z.enum(["active", "paused", "closed"]).optional(),
        reason: reasonSchema,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsWorkspace> => {
    return mapWorkspace(
      await callRpc(context.supabase, "platform_advisors_upsert_workspace", {
        _payload: {
          engagementId: data.engagementId,
          title: data.title,
          objectives: data.objectives,
          assignedAdvisorId: data.assignedAdvisorId,
          status: data.status,
        },
        _reason: data.reason,
      }),
    );
  });

export const getAdvisorsWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ workspaceId: z.string().uuid() }).strict().parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsWorkspaceDetail> => {
    return mapWorkspaceDetail(
      await callRpc(context.supabase, "platform_advisors_get_workspace", {
        _workspace_id: data.workspaceId,
      }),
    );
  });

export const openAdvisorsWorkPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        label: z.string().trim().max(200).optional(),
        periodStart: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        periodEnd: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        sessionAt: z.string().datetime({ offset: true }).optional(),
        summary: z.string().max(4000).optional(),
        reason: reasonSchema,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsWorkspaceDetail> => {
    return mapWorkspaceDetail(
      await callRpc(context.supabase, "platform_advisors_open_work_period", {
        _workspace_id: data.workspaceId,
        _payload: {
          label: data.label,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          sessionAt: data.sessionAt,
          summary: data.summary,
        },
        _reason: data.reason,
      }),
    );
  });

export const setAdvisorsDeliveryTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        taskId: z.string().uuid(),
        status: z.enum(["pending", "in_progress", "blocked", "done", "skipped"]).optional(),
        adminNote: z.string().max(4000).optional(),
        customerNote: z.string().max(4000).optional(),
        assignedAdvisorId: z.string().uuid().nullable().optional(),
        reason: reasonSchema,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsDeliveryTask> => {
    return mapDeliveryTask(
      await callRpc(context.supabase, "platform_advisors_set_delivery_task", {
        _task_id: data.taskId,
        _payload: {
          status: data.status,
          adminNote: data.adminNote,
          customerNote: data.customerNote,
          assignedAdvisorId: data.assignedAdvisorId,
        },
        _reason: data.reason,
      }),
    );
  });

export const upsertAdvisorsDocumentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        workspaceId: z.string().uuid().optional(),
        periodId: z.string().uuid().nullable().optional(),
        taskId: z.string().uuid().nullable().optional(),
        title: z.string().trim().min(2).max(200).optional(),
        instructions: z.string().max(4000).optional(),
        status: z.enum(["requested", "received", "reviewed", "cancelled"]).optional(),
        dueAt: z.string().datetime({ offset: true }).nullable().optional(),
        storagePath: z.string().trim().max(500).optional(),
        attachmentId: z.string().uuid().nullable().optional(),
        adminNote: z.string().max(4000).optional(),
        reason: reasonSchema,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsDocumentRequest> => {
    return mapDocumentRequest(
      await callRpc(context.supabase, "platform_advisors_upsert_document_request", {
        _payload: {
          id: data.id,
          workspaceId: data.workspaceId,
          periodId: data.periodId,
          taskId: data.taskId,
          title: data.title,
          instructions: data.instructions,
          status: data.status,
          dueAt: data.dueAt,
          storagePath: data.storagePath,
          attachmentId: data.attachmentId,
          adminNote: data.adminNote,
        },
        _reason: data.reason,
      }),
    );
  });

export const addAdvisorsWorkspaceNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        periodId: z.string().uuid().optional(),
        authorAdvisorId: z.string().uuid().optional(),
        visibility: z.enum(["internal", "customer"]).optional(),
        body: z.string().trim().min(1).max(8000),
        reason: reasonSchema,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsWorkspaceNote> => {
    return mapWorkspaceNote(
      await callRpc(context.supabase, "platform_advisors_add_workspace_note", {
        _workspace_id: data.workspaceId,
        _payload: {
          periodId: data.periodId,
          authorAdvisorId: data.authorAdvisorId,
          visibility: data.visibility ?? "internal",
          body: data.body,
        },
        _reason: data.reason,
      }),
    );
  });

export const listAdvisorsDocumentRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z.enum(["requested", "received", "reviewed", "cancelled"]).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .strict()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<AdvisorsDocumentRequest[]> => {
    const raw = await callRpc(context.supabase, "platform_advisors_list_document_requests", {
      _status: data.status || null,
      _limit: data.limit ?? 100,
    });
    return Array.isArray(raw) ? raw.map(mapDocumentRequest) : [];
  });
