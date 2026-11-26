import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  mapAgreement,
  mapEngagement,
  mapEngagementDetail,
  mapOnboardingBoardItem,
  mapOnboardingTask,
  mapProposal,
  type AdvisorsAgreement,
  type AdvisorsEngagement,
  type AdvisorsEngagementDetail,
  type AdvisorsOnboardingBoardItem,
  type AdvisorsOnboardingTask,
  type AdvisorsProposal,
} from "@/lib/advisors/engagements";

type RpcClient = {
  rpc: (
    fn: never,
    args?: never,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
};

async function publicClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key || url.includes(".invalid")) return null;
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function clientBucket(prefix: string): string {
  const forwarded = getRequestHeader("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || getRequestHeader("x-real-ip") || "anonymous";
  return `${prefix}:${ip.slice(0, 64)}`;
}

async function callRpc(client: unknown, fn: string, args?: Record<string, unknown>) {
  const { data, error } = await (client as RpcClient).rpc(fn as never, args as never);
  if (error) {
    const message = error.message ?? "Advisors engagements request failed.";
    if (
      message.includes("schema cache") ||
      message.includes("Could not find the function") ||
      message.includes("PGRST202")
    ) {
      throw new Error(
        "Advisors engagements are not available in this database yet. Apply the Advisors SQL migrations (AD-06), then reload the API schema cache and try again.",
      );
    }
    throw new Error(message);
  }
  return data;
}

async function callPublicRpc(fn: string, args?: Record<string, unknown>) {
  const client = await publicClient();
  if (!client) {
    throw new Error("Advisors public services are temporarily unavailable.");
  }
  return callRpc(client, fn, args);
}

const reasonSchema = z.string().trim().min(3).max(500);
const billingIntervalSchema = z
  .enum(["month", "year", "session", "one_time"])
  .nullable()
  .optional();
const listFiltersSchema = z
  .object({
    status: z.string().trim().max(40).optional(),
    search: z.string().trim().max(120).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .strict();

export const listAdvisorsEngagements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listFiltersSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<AdvisorsEngagement[]> => {
    const raw = await callRpc(context.supabase, "platform_advisors_list_engagements", {
      _status: data.status || null,
      _search: data.search || null,
      _limit: data.limit ?? 100,
    });
    return Array.isArray(raw) ? raw.map(mapEngagement) : [];
  });

export const getAdvisorsEngagement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ engagementId: z.string().uuid() }).strict().parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsEngagementDetail> => {
    return mapEngagementDetail(
      await callRpc(context.supabase, "platform_advisors_get_engagement", {
        _engagement_id: data.engagementId,
      }),
    );
  });

export const upsertAdvisorsEngagement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        clientId: z.string().uuid(),
        assignedAdvisorId: z.string().uuid().nullable().optional(),
        serviceCode: z.enum(["bookkeeping", "coaching"]),
        planCode: z.string().trim().max(80).nullable().optional(),
        title: z.string().trim().min(2).max(200),
        status: z
          .enum(["draft", "proposed", "accepted", "onboarding", "active", "paused", "closed"])
          .optional(),
        currency: z.string().trim().min(3).max(3).optional(),
        amountMinor: z.number().int().min(0).max(100_000_000).optional(),
        billingInterval: billingIntervalSchema,
        scopeSummary: z.string().max(4000).optional(),
        notes: z.string().max(4000).optional(),
        reason: reasonSchema,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsEngagement> => {
    return mapEngagement(
      await callRpc(context.supabase, "platform_advisors_upsert_engagement", {
        _payload: {
          id: data.id,
          clientId: data.clientId,
          assignedAdvisorId: data.assignedAdvisorId,
          serviceCode: data.serviceCode,
          planCode: data.planCode,
          title: data.title,
          status: data.status,
          currency: data.currency,
          amountMinor: data.amountMinor,
          billingInterval: data.billingInterval,
          scopeSummary: data.scopeSummary ?? "",
          notes: data.notes ?? "",
        },
        _reason: data.reason,
      }),
    );
  });

export const upsertAdvisorsProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        engagementId: z.string().uuid(),
        title: z.string().trim().min(2).max(200).optional(),
        summary: z.string().max(4000).optional(),
        scopeText: z.string().max(8000).optional(),
        exclusionsText: z.string().max(4000).optional(),
        serviceCode: z.enum(["bookkeeping", "coaching"]).optional(),
        planCode: z.string().trim().max(80).nullable().optional(),
        currency: z.string().trim().min(3).max(3).optional(),
        amountMinor: z.number().int().min(0).max(100_000_000).optional(),
        billingInterval: billingIntervalSchema,
        validUntil: z.string().datetime({ offset: true }).nullable().optional(),
        reason: reasonSchema,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsProposal> => {
    return mapProposal(
      await callRpc(context.supabase, "platform_advisors_upsert_proposal", {
        _payload: {
          id: data.id,
          engagementId: data.engagementId,
          title: data.title,
          summary: data.summary,
          scopeText: data.scopeText,
          exclusionsText: data.exclusionsText,
          serviceCode: data.serviceCode,
          planCode: data.planCode,
          currency: data.currency,
          amountMinor: data.amountMinor,
          billingInterval: data.billingInterval,
          validUntil: data.validUntil,
        },
        _reason: data.reason,
      }),
    );
  });

export const sendAdvisorsProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        proposalId: z.string().uuid(),
        reason: reasonSchema,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsProposal> => {
    return mapProposal(
      await callRpc(context.supabase, "platform_advisors_send_proposal", {
        _proposal_id: data.proposalId,
        _reason: data.reason,
      }),
    );
  });

export const getPublicAdvisorsProposal = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z
      .object({ token: z.string().trim().min(16).max(128) })
      .strict()
      .parse(input),
  )
  .handler(async ({ data }): Promise<AdvisorsProposal> => {
    return mapProposal(await callPublicRpc("advisors_get_proposal", { _token: data.token }));
  });

export const respondPublicAdvisorsProposal = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        token: z.string().trim().min(16).max(128),
        decision: z.enum(["accept", "decline"]),
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().email().max(200),
        note: z.string().trim().max(1000).optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data }): Promise<AdvisorsProposal> => {
    return mapProposal(
      await callPublicRpc("advisors_respond_proposal", {
        _token: data.token,
        _decision: data.decision,
        _name: data.name,
        _email: data.email,
        _note: data.note ?? "",
        _bucket: clientBucket("advisors-proposal"),
      }),
    );
  });

export const getPublicAdvisorsAgreement = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z
      .object({ token: z.string().trim().min(16).max(128) })
      .strict()
      .parse(input),
  )
  .handler(async ({ data }): Promise<AdvisorsAgreement> => {
    return mapAgreement(await callPublicRpc("advisors_get_agreement", { _token: data.token }));
  });

export const acceptPublicAdvisorsAgreement = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        token: z.string().trim().min(16).max(128),
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().email().max(200),
        consent: z.literal(true),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data }): Promise<AdvisorsAgreement> => {
    return mapAgreement(
      await callPublicRpc("advisors_accept_agreement", {
        _token: data.token,
        _name: data.name,
        _email: data.email,
        _consent: data.consent,
        _bucket: clientBucket("advisors-agreement"),
      }),
    );
  });

export const listAdvisorsOnboarding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        status: z.enum(["onboarding", "active", "accepted"]).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .strict()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<AdvisorsOnboardingBoardItem[]> => {
    const raw = await callRpc(context.supabase, "platform_advisors_list_onboarding", {
      _status: data.status || null,
      _limit: data.limit ?? 100,
    });
    return Array.isArray(raw) ? raw.map(mapOnboardingBoardItem) : [];
  });

export const setAdvisorsOnboardingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
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
  .handler(async ({ data, context }): Promise<AdvisorsOnboardingTask> => {
    return mapOnboardingTask(
      await callRpc(context.supabase, "platform_advisors_set_onboarding_task", {
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
