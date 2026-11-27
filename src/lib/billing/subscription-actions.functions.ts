import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { isPlanCode, type BillingInterval, type PlanCode } from "@/lib/billing/pricing";
import { stripePortalBody } from "@/lib/billing/provider-actions";
import { assertStripeTestKey } from "@/lib/billing/provider-keys";
import {
  estimateProratedDifferenceMinor,
  razorpayMandateKindFromNotes,
  razorpaySupportsImmediatePlanChange,
  remainingBillingDays,
  type RazorpayMandateKind,
} from "@/lib/billing/plan-change-math";
import { unixToIso } from "@/lib/billing/providers/normalise";

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

const PREVIEW_FRESHNESS_SECONDS = 15 * 60;

export function parsePlanChange(input: {
  companyId: string;
  planCode: string;
  interval?: string;
  origin?: string;
  prorationDateUnix?: number | null;
}) {
  let origin = "";
  if (input?.origin) {
    try {
      origin = new URL(input.origin).origin;
    } catch {
      throw new Error("The return address is not valid.");
    }
  }
  const rawProration = input?.prorationDateUnix;
  let prorationDateUnix: number | null = null;
  if (rawProration != null && rawProration !== undefined) {
    const n = Number(rawProration);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error("That plan-change preview is invalid. Refresh and try again.");
    }
    prorationDateUnix = Math.floor(n);
  }
  return {
    companyId: assertUuid(input?.companyId),
    planCode: requirePlan(input?.planCode),
    interval: optionalInterval(input?.interval),
    origin,
    prorationDateUnix,
  };
}

function assertPreviewFresh(prorationDateUnix: number | null | undefined): void {
  if (prorationDateUnix == null) return;
  const age = Math.floor(Date.now() / 1000) - prorationDateUnix;
  if (age < 0 || age > PREVIEW_FRESHNESS_SECONDS) {
    throw new Error("That plan-change preview expired. Refresh the amounts and confirm again.");
  }
}

export type PlanChangeAppliesMode =
  "immediate" | "period_end" | "unsupported" | "migration_required";

export type PlanChangePreview = {
  kind: "upgrade" | "downgrade";
  /** Locked from company_subscriptions.provider — UI must not guess. */
  provider: "stripe" | "razorpay";
  planCode: string;
  planName: string;
  interval: "month" | "year";
  currency: string;
  listAmountMinor: number;
  /** Current plan recurring amount (list) for the confirmation summary. */
  currentListAmountMinor: number;
  amountDueMinor: number;
  creditMinor: number;
  chargeMinor: number;
  /** Tax from provider preview when reported; never invented. */
  taxMinor: number;
  totalDueMinor: number;
  remainingDays: number | null;
  nextRenewalAt: string | null;
  newRecurringMinor: number;
  paymentMethodLabel: string;
  appliesMode: PlanChangeAppliesMode;
  /** Unix seconds — pass back on confirm so Stripe uses the same proration_date. */
  prorationDateUnix: number | null;
  previewIssuedAt: string;
  effectiveAt: string | null;
  paymentRequired: boolean;
  /** False when the provider cannot mutate the mandate (Razorpay UPI / e-mandate). */
  changeSupported: boolean;
  unsupportedReason: string | null;
  lines: { description: string; amountMinor: number }[];
  currentPlanCode: string;
  currentInterval: string;
};

export type PlanChangeResult = {
  kind: "upgrade" | "downgrade";
  provider: "stripe" | "razorpay";
  applies: "after_payment" | "period_end" | "immediate";
  effectiveAt: string | null;
  targetPlanCode: string;
  targetInterval: "month" | "year";
  paymentActionUrl: string | null;
  amountDueMinor: number;
  alreadyApplied: boolean;
  chargedOnFile: boolean;
};

function emptyUnsupportedPreview(
  change: PreparedPlanChange,
  reason: string,
  paymentMethodLabel: string,
  appliesMode: PlanChangeAppliesMode = "unsupported",
): PlanChangePreview {
  const remainingDays = remainingBillingDays(change.periodEnd);
  return {
    kind: change.kind,
    provider: change.provider,
    planCode: change.planCode,
    planName: change.planName,
    interval: change.interval,
    currency: change.currency,
    listAmountMinor: change.amountMinor,
    currentListAmountMinor: change.currentAmountMinor,
    amountDueMinor: 0,
    creditMinor: 0,
    chargeMinor: 0,
    taxMinor: 0,
    totalDueMinor: 0,
    remainingDays,
    nextRenewalAt: change.periodEnd,
    newRecurringMinor: change.amountMinor,
    paymentMethodLabel,
    appliesMode,
    prorationDateUnix: null,
    previewIssuedAt: new Date().toISOString(),
    effectiveAt: change.periodEnd,
    paymentRequired: false,
    changeSupported: false,
    unsupportedReason: reason,
    lines: [{ description: reason, amountMinor: 0 }],
    currentPlanCode: change.currentPlanCode,
    currentInterval: change.currentInterval,
  };
}

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

function mandateLabel(kind: RazorpayMandateKind): string {
  if (kind === "card") return "Card on file (Razorpay)";
  if (kind === "upi") return "UPI AutoPay (Razorpay)";
  if (kind === "emandate") return "Bank e-mandate (Razorpay)";
  return "Razorpay mandate";
}

/** Preview plan/interval change with provider proration before confirm (no mutation). */
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

    if (change.provider === "razorpay") {
      const { createRazorpayClient, razorpayInspectSubscription } =
        await import("@/lib/billing/providers/razorpay.server");
      let mandate: RazorpayMandateKind = "unknown";
      let periodStartIso: string | null = null;
      let periodEndIso = change.periodEnd;
      try {
        const inspected = await razorpayInspectSubscription(
          createRazorpayClient(),
          change.providerSubscriptionId,
        );
        mandate = razorpayMandateKindFromNotes(inspected.notes, inspected.payment_method);
        periodStartIso = unixToIso(inspected.current_start);
        periodEndIso = unixToIso(inspected.current_end) ?? change.periodEnd;
      } catch {
        // Fall through with notes unknown — fail closed for in-place changes.
      }

      if (!razorpaySupportsImmediatePlanChange(mandate)) {
        const reason =
          mandate === "upi" || mandate === "emandate"
            ? "UPI AutoPay and bank e-mandate subscriptions cannot change plan mid-cycle on Razorpay. Cancel at period end, then subscribe to the new plan. Your current mandate is not charged for this preview."
            : "This Razorpay subscription’s payment method does not support in-place plan changes. Cancel at period end, then subscribe to the new plan.";
        return emptyUnsupportedPreview(
          { ...change, periodEnd: periodEndIso },
          reason,
          mandateLabel(mandate),
          "migration_required",
        );
      }

      if (change.kind === "downgrade") {
        const remainingDays = remainingBillingDays(periodEndIso);
        return {
          kind: "downgrade",
          provider: "razorpay",
          planCode: change.planCode,
          planName: change.planName,
          interval: change.interval,
          currency: change.currency,
          listAmountMinor: change.amountMinor,
          currentListAmountMinor: change.currentAmountMinor,
          amountDueMinor: 0,
          creditMinor: 0,
          chargeMinor: 0,
          taxMinor: 0,
          totalDueMinor: 0,
          remainingDays,
          nextRenewalAt: periodEndIso,
          newRecurringMinor: change.amountMinor,
          paymentMethodLabel: mandateLabel(mandate),
          appliesMode: "period_end",
          prorationDateUnix: Math.floor(Date.now() / 1000),
          previewIssuedAt: new Date().toISOString(),
          effectiveAt: periodEndIso,
          paymentRequired: false,
          changeSupported: true,
          unsupportedReason: null,
          lines: [
            {
              description: "Lower plan starts at the next renewal. No charge today.",
              amountMinor: 0,
            },
          ],
          currentPlanCode: change.currentPlanCode,
          currentInterval: change.currentInterval,
        };
      }

      const prorated = estimateProratedDifferenceMinor({
        currentAmountMinor: change.currentAmountMinor,
        targetAmountMinor: change.amountMinor,
        periodStartIso,
        periodEndIso,
      });
      const remainingDays = remainingBillingDays(periodEndIso);
      const prorationDateUnix = Math.floor(Date.now() / 1000);
      return {
        kind: "upgrade",
        provider: "razorpay",
        planCode: change.planCode,
        planName: change.planName,
        interval: change.interval,
        currency: change.currency,
        listAmountMinor: change.amountMinor,
        currentListAmountMinor: change.currentAmountMinor,
        amountDueMinor: prorated,
        creditMinor: 0,
        chargeMinor: prorated,
        taxMinor: 0,
        totalDueMinor: prorated,
        remainingDays,
        nextRenewalAt: periodEndIso,
        newRecurringMinor: change.amountMinor,
        paymentMethodLabel: mandateLabel(mandate),
        appliesMode: "immediate",
        prorationDateUnix,
        previewIssuedAt: new Date().toISOString(),
        effectiveAt: null,
        paymentRequired: prorated > 0,
        changeSupported: true,
        unsupportedReason: null,
        lines: [
          {
            description: `Estimated prorated upgrade for remaining ${remainingDays ?? "—"} day(s). Razorpay charges the authoritative amount on confirm.`,
            amountMinor: prorated,
          },
        ],
        currentPlanCode: change.currentPlanCode,
        currentInterval: change.currentInterval,
      };
    }

    const { ensureProviderPrice } = await import("@/lib/billing/providers/price-mapping.server");
    const providerPriceId = await ensureProviderPrice(change.provider, {
      planPriceId: change.planPriceId,
      planName: change.planName,
      currency: change.currency,
      amountMinor: change.amountMinor,
      interval: change.interval,
    });

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
      const nextRenewalAt =
        preview.periodEndUnix != null ? unixToIso(preview.periodEndUnix) : change.periodEnd;
      const remainingDays = remainingBillingDays(nextRenewalAt);
      const amountDue = paymentRequired ? preview.amountDueMinor : 0;
      return {
        kind: change.kind,
        provider: "stripe",
        planCode: change.planCode,
        planName: change.planName,
        interval: change.interval,
        currency: preview.currency || change.currency,
        listAmountMinor: change.amountMinor,
        currentListAmountMinor: change.currentAmountMinor,
        amountDueMinor: amountDue,
        creditMinor: preview.creditMinor,
        chargeMinor: preview.chargeMinor,
        taxMinor: preview.taxMinor,
        totalDueMinor: amountDue,
        remainingDays,
        nextRenewalAt,
        newRecurringMinor: change.amountMinor,
        paymentMethodLabel: "Card on file (Stripe)",
        appliesMode: change.kind === "upgrade" ? "immediate" : "period_end",
        prorationDateUnix: preview.prorationDateUnix,
        previewIssuedAt: new Date().toISOString(),
        effectiveAt: change.kind === "upgrade" ? null : change.periodEnd,
        paymentRequired,
        changeSupported: true,
        unsupportedReason: null,
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
 * - Upgrade (Stripe / Razorpay card): prorated charge now; entitlement after payment/update.
 * - Downgrade: schedule at period end; keep current entitlement until then.
 * - Razorpay UPI / e-mandate: refuse in-place change (migration required).
 */
export const changePlanFor = createServerOnlyFn(
  async (
    context: { supabase: unknown; userId: string },
    data: ReturnType<typeof parsePlanChange>,
  ): Promise<PlanChangeResult> => {
    assertPreviewFresh(data.prorationDateUnix);
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

    if (change.provider === "razorpay") {
      const { createRazorpayClient, razorpayInspectSubscription, razorpayChangePlan } =
        await import("@/lib/billing/providers/razorpay.server");
      const razorpay = createRazorpayClient();
      const inspected = await razorpayInspectSubscription(razorpay, change.providerSubscriptionId);
      const mandate = razorpayMandateKindFromNotes(inspected.notes, inspected.payment_method);
      if (!razorpaySupportsImmediatePlanChange(mandate)) {
        throw new Error(
          "UPI AutoPay and bank e-mandate subscriptions cannot change plan. Cancel this subscription and subscribe to the new plan after it ends.",
        );
      }

      const scheduleAt = change.kind === "upgrade" ? "now" : "cycle_end";
      if (change.kind === "downgrade") {
        await recordPlanChange({
          companyId: data.companyId,
          planPriceId: change.planPriceId,
          kind: "scheduled",
          effectiveAt: unixToIso(inspected.current_end) ?? change.periodEnd,
          actor: context.userId,
        });
      }

      await razorpayChangePlan(
        razorpay,
        change.providerSubscriptionId,
        providerPriceId,
        scheduleAt,
      );

      if (change.kind === "upgrade") {
        try {
          await recordPlanChange({
            companyId: data.companyId,
            planPriceId: change.planPriceId,
            kind: "pending_payment",
            effectiveAt: null,
            actor: context.userId,
          });
        } catch {
          /* webhook remains authoritative for entitlement */
        }
      }

      // Entitlements stay on the prior plan until subscription.updated / charged webhook sync.
      // Do not claim chargedOnFile — Razorpay may still be collecting; webhook is authoritative.
      return {
        kind: change.kind,
        provider: "razorpay",
        applies: change.kind === "upgrade" ? "after_payment" : "period_end",
        effectiveAt: unixToIso(inspected.current_end) ?? change.periodEnd,
        targetPlanCode: data.planCode,
        targetInterval: change.interval,
        paymentActionUrl: null,
        amountDueMinor: 0,
        alreadyApplied: false,
        chargedOnFile: false,
      };
    }

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

    const {
      createStripeClient,
      stripeChangePrice,
      stripePlanChangeIdempotencyKey,
      friendlyStripePlanChangeError,
    } = await import("@/lib/billing/providers/stripe.server");
    const stripe = createStripeClient();
    const key = stripePlanChangeIdempotencyKey(
      data.companyId,
      change.planPriceId,
      change.kind,
      data.prorationDateUnix,
    );

    let stripeResult;
    try {
      stripeResult = await stripeChangePrice(
        stripe,
        change.providerSubscriptionId,
        providerPriceId,
        change.kind,
        key,
        { prorationDateUnix: data.prorationDateUnix },
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

    return {
      kind: change.kind,
      provider: "stripe",
      applies: change.kind === "upgrade" ? "after_payment" : "period_end",
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
  .inputValidator(parsePlanChange)
  .handler(({ data, context }) => changePlanFor(context, data));
