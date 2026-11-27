import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { isPlanCode, type BillingInterval, type PlanCode } from "@/lib/billing/pricing";
import { stripePortalBody } from "@/lib/billing/provider-actions";
import { assertStripeTestKey } from "@/lib/billing/provider-keys";

function requirePlan(value: string | undefined): PlanCode {
  if (!value || !isPlanCode(value)) throw new Error("Choose a plan.");
  return value;
}

function optionalInterval(value: string | undefined): BillingInterval | null {
  if (value === "month" || value === "year") return value;
  if (!value) return null;
  throw new Error("Billing period must be monthly or yearly.");
}

async function stripePost(path: string, body: URLSearchParams): Promise<Record<string, unknown>> {
  const secret = process.env["STRIPE_SECRET_KEY"];
  if (!secret) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY (sk_test_…) on the server environment and redeploy.",
    );
  }
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

type RpcClient = {
  rpc: (
    fn: never,
    args?: never,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

type PreparedPlanChange = {
  kind: "upgrade" | "downgrade";
  provider: "stripe" | "razorpay";
  providerSubscriptionId: string;
  planPriceId: string;
  planName: string;
  planCode: string;
  currency: string;
  amountMinor: number;
  interval: "month" | "year";
  currentPlanCode: string;
  currentInterval: string;
  currentAmountMinor: number;
  periodEnd: string | null;
};

async function preparePlanChange(
  supabase: unknown,
  companyId: string,
  planCode: string,
  interval: BillingInterval | null,
): Promise<PreparedPlanChange> {
  const { data, error } = await (supabase as RpcClient).rpc(
    "billing_prepare_plan_change" as never,
    {
      _company_id: companyId,
      _plan_code: planCode,
      _interval: interval,
    } as never,
  );
  if (error) throw new Error(error.message);
  const change = data as {
    kind: string;
    provider: "stripe" | "razorpay";
    providerSubscriptionId: string;
    planPriceId: string;
    planName: string;
    planCode: string;
    currency: string;
    amountMinor: number;
    interval: "month" | "year";
    currentPlanCode: string;
    currentInterval: string;
    currentAmountMinor: number;
    periodEnd: string | null;
  };
  if (change.kind !== "upgrade" && change.kind !== "downgrade") {
    throw new Error("Choose a different plan or billing period.");
  }
  return { ...change, kind: change.kind };
}

export const openBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; origin: string }) => ({
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
    if (subscription?.provider === "razorpay") {
      throw new Error(
        "Payment method updates for Razorpay subscriptions use Razorpay’s customer portal or support flow — not the Stripe billing portal.",
      );
    }
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

export function parsePlanChange(input: {
  companyId: string;
  planCode: string;
  interval?: string;
  origin?: string;
}) {
  let origin = "";
  if (input?.origin) {
    try {
      origin = new URL(input.origin).origin;
    } catch {
      throw new Error("The return address is not valid.");
    }
  }
  return {
    companyId: assertUuid(input?.companyId),
    planCode: requirePlan(input?.planCode),
    interval: optionalInterval(input?.interval),
    origin,
  };
}

export type PlanChangePreview = {
  kind: "upgrade" | "downgrade";
  planCode: string;
  planName: string;
  interval: "month" | "year";
  currency: string;
  listAmountMinor: number;
  amountDueMinor: number;
  creditMinor: number;
  chargeMinor: number;
  effectiveAt: string | null;
  paymentRequired: boolean;
  lines: { description: string; amountMinor: number }[];
  currentPlanCode: string;
  currentInterval: string;
};

export type PlanChangeResult = {
  kind: "upgrade" | "downgrade";
  applies: "after_payment" | "period_end";
  effectiveAt: string | null;
  targetPlanCode: string;
  targetInterval: "month" | "year";
  paymentActionUrl: string | null;
  amountDueMinor: number;
  alreadyApplied: boolean;
  chargedOnFile: boolean;
};

async function recordPlanChange(input: {
  companyId: string;
  planPriceId: string;
  kind: "pending_payment" | "scheduled";
  effectiveAt: string | null;
  actor: string;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc(
    "billing_record_plan_change" as never,
    {
      _company_id: input.companyId,
      _plan_price_id: input.planPriceId,
      _kind: input.kind,
      _effective_at: input.effectiveAt,
      _actor: input.actor,
    } as never,
  );
  if (error) throw new Error(error.message);
}

/** Preview plan/interval change with Stripe proration before confirm (no mutation). */
export const previewOrganisationPlanChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parsePlanChange)
  .handler(async ({ data, context }): Promise<PlanChangePreview> => {
    await assertCompanyPermission(context.supabase, data.companyId, "billing.manage");
    const change = await preparePlanChange(
      context.supabase,
      data.companyId,
      data.planCode,
      data.interval,
    );
    const { ensureProviderPrice } = await import("@/lib/billing/providers/price-mapping.server");
    const providerPriceId = await ensureProviderPrice(change.provider, {
      planPriceId: change.planPriceId,
      planName: change.planName,
      currency: change.currency,
      amountMinor: change.amountMinor,
      interval: change.interval,
    });

    if (change.provider !== "stripe") {
      return {
        kind: change.kind,
        planCode: change.planCode,
        planName: change.planName,
        interval: change.interval,
        currency: change.currency,
        listAmountMinor: change.amountMinor,
        amountDueMinor: 0,
        creditMinor: 0,
        chargeMinor: 0,
        effectiveAt: change.periodEnd,
        paymentRequired: false,
        lines: [
          {
            description:
              "Razorpay plan changes apply at the next renewal with no mid-cycle charge.",
            amountMinor: 0,
          },
        ],
        currentPlanCode: change.currentPlanCode,
        currentInterval: change.currentInterval,
      };
    }

    const { createStripeClient, stripePreviewPlanChange, friendlyStripePlanChangeError } =
      await import("@/lib/billing/providers/stripe.server");
    try {
      const preview = await stripePreviewPlanChange(
        createStripeClient(),
        change.providerSubscriptionId,
        providerPriceId,
        change.kind,
      );
      const paymentRequired = change.kind === "upgrade" && preview.amountDueMinor > 0;
      return {
        kind: change.kind,
        planCode: change.planCode,
        planName: change.planName,
        interval: change.interval,
        currency: preview.currency || change.currency,
        listAmountMinor: change.amountMinor,
        amountDueMinor: paymentRequired ? preview.amountDueMinor : 0,
        creditMinor: preview.creditMinor,
        chargeMinor: preview.chargeMinor,
        effectiveAt: change.kind === "upgrade" ? null : change.periodEnd,
        paymentRequired,
        lines: preview.lines,
        currentPlanCode: change.currentPlanCode,
        currentInterval: change.currentInterval,
      };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      throw new Error(friendlyStripePlanChangeError(message));
    }
  });

/** Withdraw a scheduled downgrade / interval change and restore Stripe price if needed. */
export const reverseScheduledPlanChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: assertUuid(input?.companyId),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "billing.manage");
    const { data: cleared, error } = await (context.supabase as RpcClient).rpc(
      "billing_clear_scheduled_plan_change" as never,
      { _company_id: data.companyId } as never,
    );
    if (error) throw new Error(error.message);
    const result = cleared as {
      cleared: boolean;
      reason?: string;
      provider?: string;
      providerSubscriptionId?: string;
      planPriceId?: string;
      planCode?: string;
      interval?: "month" | "year";
      currency?: string;
      amountMinor?: number;
    };
    if (!result.cleared) return { reversed: false, reason: result.reason ?? "nothing scheduled" };

    if (
      result.provider === "stripe" &&
      result.providerSubscriptionId &&
      result.planPriceId &&
      result.interval &&
      result.currency &&
      typeof result.amountMinor === "number"
    ) {
      const { ensureProviderPrice } = await import("@/lib/billing/providers/price-mapping.server");
      const { createStripeClient, stripeChangePrice, stripePlanChangeIdempotencyKey } =
        await import("@/lib/billing/providers/stripe.server");
      const providerPriceId = await ensureProviderPrice("stripe", {
        planPriceId: result.planPriceId,
        planName: result.planCode ?? "Plan",
        currency: result.currency,
        amountMinor: result.amountMinor,
        interval: result.interval,
      });
      await stripeChangePrice(
        createStripeClient(),
        result.providerSubscriptionId,
        providerPriceId,
        "downgrade",
        stripePlanChangeIdempotencyKey(data.companyId, result.planPriceId, "downgrade"),
      );
    }
    return { reversed: true, planCode: result.planCode ?? null };
  });

/**
 * Industry-standard plan/interval change:
 * - Upgrade: prorated charge now; entitlement after payment.
 * - Downgrade: schedule at period end; keep current entitlement until then.
 */
export const changePlanFor = createServerOnlyFn(
  async (
    context: { supabase: unknown; userId: string },
    data: ReturnType<typeof parsePlanChange>,
  ): Promise<PlanChangeResult> => {
    const change = await preparePlanChange(
      context.supabase,
      data.companyId,
      data.planCode,
      data.interval,
    );

    const { ensureProviderPrice } = await import("@/lib/billing/providers/price-mapping.server");
    const providerPriceId = await ensureProviderPrice(change.provider, {
      planPriceId: change.planPriceId,
      planName: change.planName,
      currency: change.currency,
      amountMinor: change.amountMinor,
      interval: change.interval,
    });

    if (change.kind === "downgrade") {
      await recordPlanChange({
        companyId: data.companyId,
        planPriceId: change.planPriceId,
        kind: "scheduled",
        effectiveAt: change.periodEnd,
        actor: context.userId,
      });
    }

    let paymentActionUrl: string | null = null;
    let amountDueMinor = 0;
    let alreadyApplied = false;
    let chargedOnFile = false;

    if (change.provider === "stripe") {
      const {
        createStripeClient,
        stripeChangePrice,
        stripePlanChangeIdempotencyKey,
        friendlyStripePlanChangeError,
      } = await import("@/lib/billing/providers/stripe.server");
      const stripe = createStripeClient();
      const key = stripePlanChangeIdempotencyKey(data.companyId, change.planPriceId, change.kind);

      let stripeResult;
      try {
        stripeResult = await stripeChangePrice(
          stripe,
          change.providerSubscriptionId,
          providerPriceId,
          change.kind,
          key,
        );
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        throw new Error(friendlyStripePlanChangeError(message));
      }

      alreadyApplied = stripeResult.alreadyOnPrice;
      amountDueMinor = stripeResult.amountDueMinor;
      paymentActionUrl = stripeResult.paymentActionUrl;

      if (change.kind === "upgrade") {
        if (!data.origin && paymentActionUrl) {
          throw new Error("Plan upgrades need a return URL. Refresh the page and try again.");
        }
        if (!paymentActionUrl) {
          const { syncStripeSubscriptionState } = await import("@/lib/billing/plan-sync.server");
          await syncStripeSubscriptionState(
            data.companyId,
            change.providerSubscriptionId,
            stripeResult.subscription,
          );
          alreadyApplied = true;
          chargedOnFile = !stripeResult.alreadyOnPrice;
        } else {
          try {
            await recordPlanChange({
              companyId: data.companyId,
              planPriceId: change.planPriceId,
              kind: "pending_payment",
              effectiveAt: null,
              actor: context.userId,
            });
          } catch {
            /* do not block Stripe redirect */
          }
        }
      } else {
        const { syncStripeSubscriptionState } = await import("@/lib/billing/plan-sync.server");
        await syncStripeSubscriptionState(
          data.companyId,
          change.providerSubscriptionId,
          stripeResult.subscription,
        );
      }
    } else {
      const { createRazorpayClient, razorpayChangePlan } =
        await import("@/lib/billing/providers/razorpay.server");
      await razorpayChangePlan(
        createRazorpayClient(),
        change.providerSubscriptionId,
        providerPriceId,
      );
      if (change.kind === "upgrade") {
        await recordPlanChange({
          companyId: data.companyId,
          planPriceId: change.planPriceId,
          kind: "scheduled",
          effectiveAt: change.periodEnd,
          actor: context.userId,
        });
      }
    }

    return {
      kind: change.kind,
      applies:
        change.kind === "upgrade" && change.provider === "stripe" ? "after_payment" : "period_end",
      effectiveAt: change.periodEnd,
      targetPlanCode: data.planCode,
      targetInterval: change.interval,
      paymentActionUrl,
      amountDueMinor,
      alreadyApplied,
      chargedOnFile: change.kind === "upgrade" && chargedOnFile && !paymentActionUrl,
    };
  },
);

export const syncOrganisationSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: assertUuid(input?.companyId),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "billing.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("company_subscriptions" as never)
      .select("provider, provider_subscription_id" as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const sub = row as { provider: string; provider_subscription_id: string | null } | null;
    if (sub?.provider === "razorpay") {
      throw new Error(
        "Razorpay subscriptions sync from Razorpay webhooks. Manual Stripe sync does not apply.",
      );
    }
    if (sub?.provider !== "stripe" || !sub.provider_subscription_id) {
      throw new Error("Only Stripe subscriptions can be synced this way.");
    }
    const { syncStripeSubscriptionState } = await import("@/lib/billing/plan-sync.server");
    return syncStripeSubscriptionState(data.companyId, sub.provider_subscription_id);
  });

export const changeOrganisationPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parsePlanChange)
  .handler(({ data, context }) => changePlanFor(context, data));
