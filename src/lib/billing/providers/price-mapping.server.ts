import type { ProviderId } from "@/lib/billing/providers/normalise";
import { createRazorpayClient, createRazorpayPlan } from "@/lib/billing/providers/razorpay.server";
import { createStripeClient, createStripePrice } from "@/lib/billing/providers/stripe.server";

type Admin = {
  rpc: (
    fn: never,
    args?: never,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export type SnapshotPrice = {
  planPriceId: string;
  planName: string;
  currency: string;
  amountMinor: number;
  interval: "month" | "year";
};

/**
 * Provider price for a published snapshot, created once per provider and mode. The mapping is
 * stored in the database, so renewals and webhooks resolve the same StreakBooks price.
 */
export async function ensureProviderPrice(
  provider: ProviderId,
  snapshot: SnapshotPrice,
): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Admin;
  const mode = provider === "stripe" ? createStripeClient().mode : createRazorpayClient().mode;
  const existing = await admin.rpc(
    "billing_provider_price" as never,
    { _plan_price_id: snapshot.planPriceId, _provider: provider, _mode: mode } as never,
  );
  if (existing.error) throw new Error(existing.error.message);
  const found = (existing.data as { providerPriceId?: string } | null)?.providerPriceId;
  if (found) return found;
  const created =
    provider === "stripe"
      ? await createStripePrice(createStripeClient(), snapshot)
      : await createRazorpayPlan(createRazorpayClient(), snapshot);
  const recorded = await admin.rpc(
    "billing_record_provider_price" as never,
    {
      _plan_price_id: snapshot.planPriceId,
      _provider: provider,
      _mode: mode,
      _provider_product_id: created.productId,
      _provider_price_id: created.priceId,
    } as never,
  );
  if (recorded.error) throw new Error(recorded.error.message);
  return (recorded.data as { providerPriceId: string }).providerPriceId;
}

/** Stripe tax rate for an approved exclusive rule, created once per mode. */
export async function ensureStripeTaxRate(input: {
  ruleId: string;
  label: string;
  rateBps: number;
  country: string;
}): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Admin;
  const client = createStripeClient();
  const existing = await admin.rpc(
    "billing_provider_tax_rate" as never,
    { _rule_id: input.ruleId, _provider: "stripe", _mode: client.mode } as never,
  );
  if (existing.error) throw new Error(existing.error.message);
  if (typeof existing.data === "string" && existing.data) return existing.data;
  const { createStripeTaxRate } = await import("@/lib/billing/providers/stripe.server");
  const created = await createStripeTaxRate(client, input);
  const recorded = await admin.rpc(
    "billing_record_provider_tax_rate" as never,
    { _rule_id: input.ruleId, _provider: "stripe", _mode: client.mode, _rate_id: created } as never,
  );
  if (recorded.error) throw new Error(recorded.error.message);
  return String(recorded.data);
}

/**
 * Provider coupon for a reserved code. Stripe coupons are created once per code and currency;
 * Razorpay offers must be created in the Razorpay Dashboard and linked by platform staff.
 */
export async function ensureProviderCoupon(
  provider: ProviderId,
  terms: import("@/lib/billing/providers/stripe.server").CouponTerms,
): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Admin;
  const mode = provider === "stripe" ? createStripeClient().mode : createRazorpayClient().mode;
  const existing = await admin.rpc(
    "billing_provider_coupon" as never,
    { _code: terms.code, _provider: provider, _mode: mode, _currency: terms.currency } as never,
  );
  if (existing.error) throw new Error(existing.error.message);
  if (typeof existing.data === "string" && existing.data) return existing.data;
  if (provider === "razorpay") {
    throw new Error("This promo code is not available for UPI or e-mandate payments yet.");
  }
  const { createStripeCoupon } = await import("@/lib/billing/providers/stripe.server");
  const created = await createStripeCoupon(createStripeClient(), terms);
  const recorded = await admin.rpc(
    "billing_record_provider_coupon" as never,
    {
      _code: terms.code,
      _provider: provider,
      _mode: mode,
      _currency: terms.currency,
      _coupon_id: created,
    } as never,
  );
  if (recorded.error) throw new Error(recorded.error.message);
  return String(recorded.data);
}
