import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { isPlanCode, type PlanCode } from "@/lib/billing/pricing";
import { stripePortalBody } from "@/lib/billing/provider-actions";
import { assertStripeTestKey } from "@/lib/billing/provider-keys";

function requirePlan(value: string | undefined): PlanCode {
  if (!value || !isPlanCode(value)) throw new Error("Choose a plan.");
  return value;
}

async function stripePost(path: string, body: URLSearchParams): Promise<Record<string, unknown>> {
  const secret = process.env["STRIPE_SECRET_KEY"];
  if (!secret) throw new Error("Stripe is not configured. Add a test secret on the server.");
  assertStripeTestKey(secret);
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = (await response.json()) as { error?: { message?: string } } & Record<
    string,
    unknown
  >;
  if (!response.ok)
    throw new Error(payload.error?.message ?? "Stripe could not complete that request.");
  return payload;
}

export const openBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; origin: string }) => ({
    companyId: assertUuid(input?.companyId),
    origin: input?.origin ?? "",
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "billing.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("company_subscriptions" as never)
      .select("provider, provider_customer_id" as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const subscription = row as { provider: string; provider_customer_id: string | null } | null;
    if (subscription?.provider !== "stripe" || !subscription.provider_customer_id) {
      throw new Error("A Stripe customer is recorded after the first card payment.");
    }
    let origin: string;
    try {
      origin = new URL(data.origin).origin;
    } catch {
      throw new Error("The return address is not valid.");
    }
    const session = await stripePost(
      "billing_portal/sessions",
      stripePortalBody(
        subscription.provider_customer_id,
        `${origin}/settings?section=subscription`,
      ),
    );
    const url = typeof session["url"] === "string" ? session["url"] : "";
    if (!url) throw new Error("Stripe did not return a portal address.");
    return { url };
  });

export function parsePlanChange(input: { companyId: string; planCode: string; interval?: string }) {
  return {
    companyId: assertUuid(input?.companyId),
    planCode: requirePlan(input?.planCode),
  };
}

/** Changes the plan at the provider and records it; shared by the server function and REST v1. */
export const changePlanFor = createServerOnlyFn(
  async (
    context: { supabase: unknown; userId: string },
    data: ReturnType<typeof parsePlanChange>,
  ) => {
    // The database checks billing permission, the subscription and the published target price.
    const { data: prepared, error } = await (
      context.supabase as {
        rpc: (
          fn: never,
          args: never,
        ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
      }
    ).rpc(
      "billing_prepare_plan_change" as never,
      { _company_id: data.companyId, _plan_code: data.planCode } as never,
    );
    if (error) throw new Error(error.message);
    const change = prepared as {
      kind: "upgrade" | "downgrade" | "same";
      provider: "stripe" | "razorpay";
      providerSubscriptionId: string;
      planPriceId: string;
      planName: string;
      currency: string;
      amountMinor: number;
      interval: "month" | "year";
      periodEnd: string | null;
    };
    if (change.kind === "same") throw new Error("Choose a plan with a different price.");
    const { ensureProviderPrice } = await import("@/lib/billing/providers/price-mapping.server");
    const providerPriceId = await ensureProviderPrice(change.provider, {
      planPriceId: change.planPriceId,
      planName: change.planName,
      currency: change.currency,
      amountMinor: change.amountMinor,
      interval: change.interval,
    });
    const key = `linkbooks-plan-${data.companyId}-${change.planPriceId}`;
    let applies: "after_payment" | "period_end";
    if (change.provider === "stripe") {
      const { createStripeClient, stripeChangePrice } =
        await import("@/lib/billing/providers/stripe.server");
      await stripeChangePrice(
        createStripeClient(),
        change.providerSubscriptionId,
        providerPriceId,
        change.kind,
        key,
      );
      applies = change.kind === "upgrade" ? "after_payment" : "period_end";
    } else {
      const { createRazorpayClient, razorpayChangePlan } =
        await import("@/lib/billing/providers/razorpay.server");
      await razorpayChangePlan(
        createRazorpayClient(),
        change.providerSubscriptionId,
        providerPriceId,
      );
      applies = "period_end";
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: recordError } = await supabaseAdmin.rpc(
      "billing_record_plan_change" as never,
      {
        _company_id: data.companyId,
        _plan_price_id: change.planPriceId,
        _kind: applies === "after_payment" ? "pending_payment" : "scheduled",
        _effective_at: applies === "period_end" ? change.periodEnd : null,
        _actor: context.userId,
      } as never,
    );
    if (recordError) throw new Error(recordError.message);
    return { kind: change.kind, applies, effectiveAt: change.periodEnd };
  },
);

export const changeOrganisationPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parsePlanChange)
  .handler(({ data, context }) => changePlanFor(context, data));
