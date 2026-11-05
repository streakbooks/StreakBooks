import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CANCELLATION_REASONS } from "@/lib/billing/domain/lifecycle";

/**
 * Subscription lifecycle for customers and platform staff. The database functions check billing
 * permissions, MFA and platform sessions again; nothing here is trusted on its own.
 */
type RpcClient = {
  rpc: (
    fn: never,
    args?: never,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
};

async function callRpc(client: unknown, fn: string, args?: Record<string, unknown>) {
  const { data, error } = await (client as RpcClient).rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data;
}

export type SubscriptionEvent = {
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  fromPlan: string | null;
  toPlan: string | null;
  source: string;
  effectiveAt: string | null;
  occurredAt: string;
};

export type SubscriptionState = {
  status: string | null;
  planCode: string | null;
  provider: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  access: "full" | "read_only";
  canManage: boolean;
  eligibility: { allowed: true; effectiveAt: string } | { allowed: false; reason: string };
  cancellation: {
    id: string;
    requestedAt: string;
    effectiveAt: string;
    reversible: boolean;
    policyVersion: number | null;
  } | null;
  policy: { id: string; version: number; title: string; body: string } | null;
  events: SubscriptionEvent[];
};

const companyInput = z.object({ companyId: z.string().uuid() }).strict();
const reasonCodes = CANCELLATION_REASONS.map((reason) => reason.id) as [string, ...string[]];
const cancelInput = z
  .object({
    companyId: z.string().uuid(),
    confirm: z.literal(true),
    policyDocumentId: z.string().uuid().nullable(),
    reasonCode: z.enum(reasonCodes).nullable(),
    reasonText: z.string().trim().max(1000).nullable(),
  })
  .strict();
const platformInput = z
  .object({ companyId: z.string().uuid(), reason: z.string().trim().min(3).max(500) })
  .strict();

/** Keyed hash of the client address; without a configured secret nothing is stored. */
async function clientAddressHash(): Promise<string | null> {
  const secret = (process.env["BILLING_IP_HASH_SECRET"] ?? "").trim();
  const forwarded = getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || getRequestHeader("x-real-ip")?.trim();
  if (!secret || !address) return null;
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", secret).update(address).digest("hex");
}

export const getSubscriptionState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => companyInput.parse(input))
  .handler(
    async ({ data, context }) =>
      (await callRpc(context.supabase, "billing_subscription_state", {
        _company_id: data.companyId,
      })) as SubscriptionState,
  );

export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cancelInput.parse(input))
  .handler(async ({ data, context }) => {
    const result = (await callRpc(context.supabase, "billing_cancel_subscription", {
      _company_id: data.companyId,
      _confirm: data.confirm,
      _policy_document_id: data.policyDocumentId,
      _reason_code: data.reasonCode,
      _reason_text: data.reasonText,
      _ip_hash: await clientAddressHash(),
    })) as { requestId: string; effectiveAt: string; status: "scheduled" | "effective" };
    const notice = await sendCancellationNotice(context, data.companyId, result);
    return { ...result, notice };
  });

async function sendCancellationNotice(
  context: { supabase: unknown; claims: Record<string, unknown> },
  companyId: string,
  result: { requestId: string; effectiveAt: string; status: string },
): Promise<"sent" | "failed" | "not_configured"> {
  const email = typeof context.claims["email"] === "string" ? context.claims["email"] : "";
  const { readEmailConfig, sendViaResend } = await import("@/lib/documents/email-provider.server");
  const config = readEmailConfig();
  const record = (status: "sent" | "failed" | "not_configured", extra: Record<string, unknown>) =>
    callRpc(context.supabase, "billing_record_cancellation_notice", {
      _request_id: result.requestId,
      _to: email ? [email] : null,
      _subject: extra["subject"] ?? null,
      _provider: config.configured ? config.provider : null,
      _message_id: extra["messageId"] ?? null,
      _status: status,
      _error: extra["error"] ?? null,
    }).catch(() => undefined);
  if (!config.configured || !email) {
    await record("not_configured", {});
    return "not_configured";
  }
  const { data: company } = await (
    context.supabase as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (
            column: string,
            value: string,
          ) => { maybeSingle: () => PromiseLike<{ data: { name: string } | null }> };
        };
      };
    }
  )
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .maybeSingle();
  const name = company?.name ?? "your organisation";
  const date = new Date(result.effectiveAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const ended = result.status === "effective";
  const subject = ended
    ? `Your LinkBooks subscription for ${name} has ended`
    : `Your LinkBooks subscription for ${name} ends on ${date}`;
  const text = ended
    ? `The LinkBooks subscription for ${name} has ended. Your records stay available to view and export. Choose a plan in Settings > Subscription to post again.`
    : `The LinkBooks subscription for ${name} is set to end on ${date}. You can keep using LinkBooks until then, and you can withdraw the cancellation before that date in Settings > Subscription. Your records stay available after it ends.`;
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const sent = await sendViaResend(config, {
    to: [email],
    subject,
    text,
    html: `<p>${escaped}</p>`,
    idempotencyKey: `billing-cancellation-${result.requestId}`,
  });
  await record(sent.ok ? "sent" : "failed", {
    subject,
    messageId: sent.ok ? sent.messageId : null,
    error: sent.ok ? null : sent.error,
  });
  return sent.ok ? "sent" : "failed";
}

export const reverseCancellation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => companyInput.parse(input))
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "billing_reverse_cancellation", {
      _company_id: data.companyId,
    });
    return { ok: true as const };
  });

export const pauseSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => platformInput.parse(input))
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "platform_pause_subscription", {
      _company_id: data.companyId,
      _reason: data.reason,
    });
    return { ok: true as const };
  });

export const resumeSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => platformInput.parse(input))
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "platform_resume_subscription", {
      _company_id: data.companyId,
      _reason: data.reason,
    });
    return { ok: true as const };
  });
