import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { isPlanCode, type PlanCode } from "@/lib/billing/pricing";
import {
  planChangeKind,
  stripePortalBody,
  stripeRecurringPriceBody,
  stripeUpgradeBody,
} from "@/lib/billing/provider-actions";
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

async function stripeGet(path: string): Promise<Record<string, unknown>> {
  const secret = process.env["STRIPE_SECRET_KEY"];
  if (!secret) throw new Error("Stripe is not configured. Add a test secret on the server.");
  assertStripeTestKey(secret);
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
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

export const changeOrganisationPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; planCode: string; interval: string }) => ({
    companyId: assertUuid(input?.companyId),
    planCode: requirePlan(input?.planCode),
    interval: input?.interval === "year" ? ("year" as const) : ("month" as const),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "billing.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("company_subscriptions" as never)
      .select(
        "plan_code, status, provider, provider_subscription_id, currency, unit_amount_minor, current_period_end, trial_ends_at" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const current = row as {
      plan_code: string;
      status: string;
      provider: string;
      provider_subscription_id: string | null;
      currency: string;
      unit_amount_minor: number | null;
      current_period_end: string | null;
      trial_ends_at: string | null;
    } | null;
    if (!current) throw new Error("This organisation has no subscription.");
    if (current.status === "complimentary") throw new Error("Demo organisations are not billed.");
    if (current.plan_code === data.planCode) throw new Error("That is already the current plan.");

    const { data: versionRow, error: versionError } = await supabaseAdmin
      .from("plan_versions" as never)
      .select("id" as never)
      .eq("plan_code" as never, data.planCode as never)
      .eq("status" as never, "published" as never)
      .order("version_no" as never, { ascending: false } as never)
      .limit(1)
      .maybeSingle();
    if (versionError) throw new Error(versionError.message);
    const version = versionRow as { id: string } | null;
    if (!version) throw new Error("That plan has no published version.");
    const { data: priceRow, error: priceError } = await supabaseAdmin
      .from("plan_prices" as never)
      .select("amount_minor" as never)
      .eq("version_id" as never, version.id as never)
      .eq("currency" as never, current.currency as never)
      .eq("billing_interval" as never, data.interval as never)
      .maybeSingle();
    if (priceError) throw new Error(priceError.message);
    const nextPrice = priceRow as { amount_minor: number } | null;
    if (!nextPrice) throw new Error("That plan has no published price in this currency.");
    const next = { amount_minor: nextPrice.amount_minor, version_id: version.id };
    const kind = planChangeKind(current.unit_amount_minor ?? 0, next.amount_minor);
    if (kind === "same") throw new Error("Choose a different plan.");

    if (kind === "downgrade") {
      const when =
        current.current_period_end ??
        current.trial_ends_at ??
        new Date(Date.now() + 30 * 86400000).toISOString();
      const { error: updateError } = await supabaseAdmin
        .from("company_subscriptions" as never)
        .update({
          scheduled_plan_code: data.planCode,
          scheduled_at: when,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("company_id" as never, data.companyId as never);
      if (updateError) throw new Error(updateError.message);
      return { kind, applies: "period_end" as const };
    }

    if (current.provider === "stripe" && current.provider_subscription_id) {
      const created = await stripePost(
        "prices",
        stripeRecurringPriceBody({
          name: `LinkBooks ${data.planCode}`,
          currency: current.currency,
          interval: data.interval,
          amountMinor: next.amount_minor,
        }),
      );
      const priceId = typeof created["id"] === "string" ? created["id"] : "";
      const subscription = await stripeGet(`subscriptions/${current.provider_subscription_id}`);
      const items = subscription["items"] as { data?: { id?: string }[] } | undefined;
      const itemId = items?.data?.[0]?.id;
      if (!priceId || !itemId) throw new Error("Stripe did not return the subscription item.");
      await stripePost(
        `subscriptions/${current.provider_subscription_id}`,
        stripeUpgradeBody(itemId, priceId),
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from("company_subscriptions" as never)
      .update({
        plan_code: data.planCode,
        billing_interval: data.interval,
        unit_amount_minor: next.amount_minor,
        price_version_id: next.version_id,
        scheduled_plan_code: null,
        scheduled_at: null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("company_id" as never, data.companyId as never);
    if (updateError) throw new Error(updateError.message);
    return { kind: "upgrade" as const, applies: "immediate" as const };
  });
