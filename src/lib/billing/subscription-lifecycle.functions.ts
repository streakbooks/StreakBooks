import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { clientAddressHash } from "@/lib/billing/client-address.server";
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

export const companyInput = z.object({ companyId: z.string().uuid() }).strict();
const reasonCodes = CANCELLATION_REASONS.map((reason) => reason.id) as [string, ...string[]];
export const cancelInput = z
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

export const getSubscriptionState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => companyInput.parse(input))
  .handler(
    async ({ data, context }) =>
      (await callRpc(context.supabase, "billing_subscription_state", {
        _company_id: data.companyId,
      })) as SubscriptionState,
  );

type LifecycleContext = { supabase: unknown; userId: string; claims: Record<string, unknown> };

/** Cancels a subscription; shared by the server function and REST v1. */
export const cancelSubscriptionFor = createServerOnlyFn(
  async (context: LifecycleContext, data: z.infer<typeof cancelInput>, headers?: Headers) => {
    const result = (await callRpc(context.supabase, "billing_cancel_subscription", {
      _company_id: data.companyId,
      _confirm: data.confirm,
      _policy_document_id: data.policyDocumentId,
      _reason_code: data.reasonCode,
      _reason_text: data.reasonText,
      _ip_hash: await clientAddressHash(headers),
    })) as {
      requestId: string;
      effectiveAt: string;
      status: "scheduled" | "effective" | "pending_provider";
    };
    const final =
      result.status === "pending_provider"
        ? await cancelAtProvider(data.companyId, result)
        : result;
    const notice = await sendCancellationNotice(context, data.companyId, final);
    return { ...final, notice };
  },
);

export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => cancelInput.parse(input))
  .handler(({ data, context }) => cancelSubscriptionFor(context, data));

type AdminRpc = {
  rpc: (
    fn: never,
    args?: never,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => { maybeSingle: () => PromiseLike<{ data: unknown }> };
    };
  };
};

async function adminClient(): Promise<AdminRpc> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AdminRpc;
}

async function providerSubscription(companyId: string) {
  const admin = await adminClient();
  const { data } = await admin
    .from("company_subscriptions")
    .select("provider, provider_subscription_id")
    .eq("company_id", companyId)
    .maybeSingle();
  const row = data as { provider: string; provider_subscription_id: string | null } | null;
  if (
    !row?.provider_subscription_id ||
    (row.provider !== "stripe" && row.provider !== "razorpay")
  ) {
    throw new Error("The payment provider subscription could not be found.");
  }
  return { admin, provider: row.provider, subscriptionId: row.provider_subscription_id };
}

/** Cancels at the provider first; the request is confirmed or marked failed by the service role. */
async function cancelAtProvider(
  companyId: string,
  pending: { requestId: string; effectiveAt: string },
): Promise<{ requestId: string; effectiveAt: string; status: "scheduled" | "effective" }> {
  const { admin, provider, subscriptionId } = await providerSubscription(companyId);
  let effectiveAt: string | null;
  try {
    if (provider === "stripe") {
      const { createStripeClient, stripeSetCancelAtPeriodEnd } =
        await import("@/lib/billing/providers/stripe.server");
      const response = await stripeSetCancelAtPeriodEnd(
        createStripeClient(),
        subscriptionId,
        true,
        `linkbooks-cancel-${pending.requestId}`,
      );
      effectiveAt = response.periodEnd;
    } else {
      const { createRazorpayClient, razorpayCancel } =
        await import("@/lib/billing/providers/razorpay.server");
      effectiveAt = (await razorpayCancel(createRazorpayClient(), subscriptionId)).effectiveAt;
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The payment provider refused the cancellation.";
    await admin.rpc(
      "billing_confirm_provider_cancellation" as never,
      {
        _request_id: pending.requestId,
        _succeeded: false,
        _effective_at: null,
        _failure: message,
      } as never,
    );
    throw new Error(`The payment provider did not cancel the subscription: ${message}`);
  }
  const confirmed = await admin.rpc(
    "billing_confirm_provider_cancellation" as never,
    {
      _request_id: pending.requestId,
      _succeeded: true,
      _effective_at: effectiveAt ?? pending.effectiveAt,
      _failure: null,
    } as never,
  );
  if (confirmed.error) throw new Error(confirmed.error.message);
  const out = confirmed.data as { status: "scheduled" | "effective"; effectiveAt: string };
  return { requestId: pending.requestId, effectiveAt: out.effectiveAt, status: out.status };
}

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
    ? `Your StreakBooks subscription for ${name} has ended`
    : `Your StreakBooks subscription for ${name} ends on ${date}`;
  const text = ended
    ? `The StreakBooks subscription for ${name} has ended. Your records stay available to view and export. Choose a plan in Settings > Subscription to post again.`
    : `The StreakBooks subscription for ${name} is set to end on ${date}. You can keep using StreakBooks until then, and you can withdraw the cancellation before that date in Settings > Subscription. Your records stay available after it ends.`;
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

/** Withdraws a scheduled cancellation; shared by the server function and REST v1. */
export const reverseCancellationFor = createServerOnlyFn(
  async (context: { supabase: unknown; userId: string }, data: z.infer<typeof companyInput>) => {
    const result = (await callRpc(context.supabase, "billing_reverse_cancellation", {
      _company_id: data.companyId,
    })) as { requestId: string; status: "reversed" | "needs_provider" };
    if (result.status === "needs_provider") {
      // Only Stripe can withdraw a scheduled cancellation; the database refuses Razorpay.
      const { admin, provider, subscriptionId } = await providerSubscription(data.companyId);
      if (provider !== "stripe")
        throw new Error("This payment provider cannot undo a cancellation.");
      const { createStripeClient, stripeSetCancelAtPeriodEnd } =
        await import("@/lib/billing/providers/stripe.server");
      await stripeSetCancelAtPeriodEnd(
        createStripeClient(),
        subscriptionId,
        false,
        `linkbooks-keep-${result.requestId}`,
      );
      const confirmed = await admin.rpc(
        "billing_confirm_provider_reversal" as never,
        { _request_id: result.requestId, _actor: context.userId } as never,
      );
      if (confirmed.error) throw new Error(confirmed.error.message);
    }
    return { ok: true as const };
  },
);

export const reverseCancellation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => companyInput.parse(input))
  .handler(({ data, context }) => reverseCancellationFor(context, data));

export const pauseSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => platformInput.parse(input))
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "platform_pause_subscription", {
      _company_id: data.companyId,
      _reason: data.reason,
    });
    return { ok: true as const };
  });

export const resumeSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => platformInput.parse(input))
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "platform_resume_subscription", {
      _company_id: data.companyId,
      _reason: data.reason,
    });
    return { ok: true as const };
  });
