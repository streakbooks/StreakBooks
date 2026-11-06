import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  mapClient,
  mapConversationDetail,
  mapConversationSummary,
  mapInquiry,
  mapOverview,
  mapStaff,
  type AdvisorsClient,
  type AdvisorsConversationDetail,
  type AdvisorsConversationSummary,
  type AdvisorsInquiry,
  type AdvisorsOverview,
  type AdvisorsStaffMember,
} from "@/lib/advisors/management";

type RpcClient = {
  rpc: (
    fn: never,
    args?: never,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
};

async function callRpc(client: unknown, fn: string, args?: Record<string, unknown>) {
  const { data, error } = await (client as RpcClient).rpc(fn as never, args as never);
  if (error) {
    const message = error.message ?? "Advisors management request failed.";
    if (
      message.includes("schema cache") ||
      message.includes("Could not find the function") ||
      message.includes("PGRST202")
    ) {
      throw new Error(
        "Advisors management console is not available in this database yet. Apply the Advisors SQL migrations (AD-05), then reload the API schema cache and try again.",
      );
    }
    throw new Error(message);
  }
  return data;
}

const reasonSchema = z.string().trim().min(3).max(500);
const listFiltersSchema = z
  .object({
    status: z.string().trim().max(40).optional(),
    search: z.string().trim().max(120).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .strict();

export const getAdvisorsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdvisorsOverview> => {
    return mapOverview(await callRpc(context.supabase, "platform_advisors_overview"));
  });

export const listAdvisorsInquiries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listFiltersSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<AdvisorsInquiry[]> => {
    const raw = await callRpc(context.supabase, "platform_advisors_list_inquiries", {
      _status: data.status || null,
      _search: data.search || null,
      _limit: data.limit ?? 100,
    });
    return Array.isArray(raw) ? raw.map(mapInquiry) : [];
  });

export const updateAdvisorsInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        inquiryId: z.string().uuid(),
        status: z.enum(["new", "contacted", "qualified", "closed"]).optional(),
        assignedAdvisorId: z.string().uuid().nullable().optional(),
        adminNotes: z.string().max(4000).optional(),
        reason: reasonSchema,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsInquiry> => {
    return mapInquiry(
      await callRpc(context.supabase, "platform_advisors_update_inquiry", {
        _inquiry_id: data.inquiryId,
        _payload: {
          status: data.status,
          assignedAdvisorId: data.assignedAdvisorId,
          adminNotes: data.adminNotes,
        },
        _reason: data.reason,
      }),
    );
  });

export const promoteAdvisorsInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        inquiryId: z.string().uuid(),
        reason: reasonSchema,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsClient> => {
    return mapClient(
      await callRpc(context.supabase, "platform_advisors_promote_inquiry", {
        _inquiry_id: data.inquiryId,
        _reason: data.reason,
      }),
    );
  });

export const listAdvisorsConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listFiltersSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<AdvisorsConversationSummary[]> => {
    const raw = await callRpc(context.supabase, "platform_advisors_list_conversations", {
      _status: data.status || null,
      _search: data.search || null,
      _limit: data.limit ?? 100,
    });
    return Array.isArray(raw) ? raw.map(mapConversationSummary) : [];
  });

export const getAdvisorsConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ conversationId: z.string().uuid() }).strict().parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsConversationDetail> => {
    return mapConversationDetail(
      await callRpc(context.supabase, "platform_advisors_get_conversation", {
        _conversation_id: data.conversationId,
      }),
    );
  });

export const updateAdvisorsConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        status: z.enum(["open", "closed", "handed_off"]).optional(),
        assignedAdvisorId: z.string().uuid().nullable().optional(),
        adminNotes: z.string().max(4000).optional(),
        reason: reasonSchema,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsConversationDetail> => {
    return mapConversationDetail(
      await callRpc(context.supabase, "platform_advisors_update_conversation", {
        _conversation_id: data.conversationId,
        _payload: {
          status: data.status,
          assignedAdvisorId: data.assignedAdvisorId,
          adminNotes: data.adminNotes,
        },
        _reason: data.reason,
      }),
    );
  });

export const listAdvisorsClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listFiltersSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<AdvisorsClient[]> => {
    const raw = await callRpc(context.supabase, "platform_advisors_list_clients", {
      _status: data.status || null,
      _search: data.search || null,
      _limit: data.limit ?? 100,
    });
    return Array.isArray(raw) ? raw.map(mapClient) : [];
  });

export const upsertAdvisorsClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        email: z.string().trim().email().max(200),
        name: z.string().trim().max(200).optional(),
        businessName: z.string().trim().max(200).optional(),
        phone: z.string().trim().max(40).optional(),
        status: z.enum(["prospect", "active", "paused", "churned"]),
        primaryServiceCode: z.enum(["bookkeeping", "coaching"]).nullable().optional(),
        assignedAdvisorId: z.string().uuid().nullable().optional(),
        notes: z.string().max(4000).optional(),
        reason: reasonSchema,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsClient> => {
    return mapClient(
      await callRpc(context.supabase, "platform_advisors_upsert_client", {
        _payload: {
          id: data.id,
          email: data.email,
          name: data.name ?? "",
          businessName: data.businessName ?? "",
          phone: data.phone,
          status: data.status,
          primaryServiceCode: data.primaryServiceCode,
          assignedAdvisorId: data.assignedAdvisorId,
          notes: data.notes ?? "",
        },
        _reason: data.reason,
      }),
    );
  });

export const listAdvisorsStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdvisorsStaffMember[]> => {
    const raw = await callRpc(context.supabase, "platform_advisors_list_staff");
    return Array.isArray(raw) ? raw.map(mapStaff) : [];
  });

export const upsertAdvisorsStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        displayName: z.string().trim().min(2).max(120),
        email: z.string().trim().email().max(200).optional().or(z.literal("")),
        timezone: z.string().trim().min(1).max(80),
        isActive: z.boolean(),
        reason: reasonSchema,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsStaffMember> => {
    return mapStaff(
      await callRpc(context.supabase, "platform_advisors_upsert_staff", {
        _payload: {
          id: data.id,
          displayName: data.displayName,
          email: data.email || null,
          timezone: data.timezone,
          isActive: data.isActive,
        },
        _reason: data.reason,
      }),
    );
  });
