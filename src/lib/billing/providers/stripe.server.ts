import { assertStripeTestKey } from "@/lib/billing/provider-keys";
import {
  STRIPE_API_VERSION,
  modeFromStripeSecret,
  stripePeriodEnd,
  type PaymentMode,
} from "@/lib/billing/providers/normalise";

/** Server-only Stripe client. Test keys unless LINKBOOKS_ALLOW_LIVE_PAYMENT_KEYS=true. */
export type StripeClient = {
  mode: PaymentMode;
  request: (
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: URLSearchParams,
    idempotencyKey?: string,
  ) => Promise<Record<string, unknown>>;
};

export function stripeConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env["STRIPE_SECRET_KEY"]);
}

export function createStripeClient(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): StripeClient {
  const secret = env["STRIPE_SECRET_KEY"];
  if (!secret) throw new Error("Card checkout needs STRIPE_SECRET_KEY on the server.");
  assertStripeTestKey(secret, env);
  return {
    mode: modeFromStripeSecret(secret),
    async request(method, path, body, idempotencyKey) {
      const response = await fetchImpl(`https://api.stripe.com/v1/${path}`, {
        method,
        signal: AbortSignal.timeout(20000),
        headers: {
          Authorization: `Bearer ${secret}`,
          "Stripe-Version": STRIPE_API_VERSION,
          ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        ...(body ? { body } : {}),
      });
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? `Stripe request failed (${response.status}).`);
      }
      return payload;
    },
  };
}

export async function createStripePrice(
  client: StripeClient,
  input: {
    planPriceId: string;
    planName: string;
    currency: string;
    amountMinor: number;
    interval: "month" | "year";
  },
): Promise<{ productId: string; priceId: string }> {
  const body = new URLSearchParams();
  body.set("currency", input.currency.toLowerCase());
  body.set("unit_amount", String(input.amountMinor));
  body.set("recurring[interval]", input.interval);
  body.set("product_data[name]", `LinkBooks ${input.planName}`);
  body.set("metadata[plan_price_id]", input.planPriceId);
  const price = await client.request(
    "POST",
    "prices",
    body,
    `linkbooks-price-${input.planPriceId}`,
  );
  const priceId = typeof price["id"] === "string" ? price["id"] : "";
  const product = price["product"];
  const productId = typeof product === "string" ? product : "";
  if (!priceId) throw new Error("Stripe did not return a price.");
  return { productId, priceId };
}

export function stripePriceCheckoutBody(input: {
  priceId: string;
  checkoutId: string;
  companyId: string;
  planCode: string;
  successUrl: string;
  cancelUrl: string;
  customerId: string | null;
  email: string | null;
  trialEndUnix: number | null;
  taxRateId?: string | null;
}): URLSearchParams {
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("success_url", input.successUrl);
  body.set("cancel_url", input.cancelUrl);
  body.set("client_reference_id", input.checkoutId);
  body.set("line_items[0][price]", input.priceId);
  body.set("line_items[0][quantity]", "1");
  if (input.taxRateId) body.set("line_items[0][tax_rates][0]", input.taxRateId);
  for (const target of ["metadata", "subscription_data[metadata]"]) {
    body.set(`${target}[checkout_id]`, input.checkoutId);
    body.set(`${target}[company_id]`, input.companyId);
    body.set(`${target}[plan_code]`, input.planCode);
  }
  if (input.customerId) {
    body.set("customer", input.customerId);
    body.set("customer_update[name]", "auto");
    body.set("customer_update[address]", "auto");
    body.set("billing_address_collection", "auto");
  } else {
    if (input.email) body.set("customer_email", input.email);
    body.set("billing_address_collection", "required");
  }
  if (input.trialEndUnix != null)
    body.set("subscription_data[trial_end]", String(input.trialEndUnix));
  return body;
}

export async function stripeSetCancelAtPeriodEnd(
  client: StripeClient,
  subscriptionId: string,
  cancel: boolean,
  idempotencyKey: string,
): Promise<{ periodEnd: string | null }> {
  const body = new URLSearchParams();
  body.set("cancel_at_period_end", cancel ? "true" : "false");
  const subscription = await client.request(
    "POST",
    `subscriptions/${encodeURIComponent(subscriptionId)}`,
    body,
    idempotencyKey,
  );
  return { periodEnd: stripePeriodEnd(subscription) };
}

/**
 * Upgrade: prorated invoice now, applied only if it is paid (pending update).
 * Downgrade: new price from the next invoice, no proration.
 */
export async function stripeChangePrice(
  client: StripeClient,
  subscriptionId: string,
  priceId: string,
  kind: "upgrade" | "downgrade",
  idempotencyKey: string,
): Promise<void> {
  const subscription = await client.request(
    "GET",
    `subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
  const items = subscription["items"] as { data?: { id?: string }[] } | undefined;
  const itemId = items?.data?.[0]?.id;
  if (!itemId) throw new Error("Stripe did not return the subscription item.");
  const body = new URLSearchParams();
  body.set("items[0][id]", itemId);
  body.set("items[0][price]", priceId);
  if (kind === "upgrade") {
    body.set("proration_behavior", "always_invoice");
    body.set("payment_behavior", "pending_if_incomplete");
  } else {
    body.set("proration_behavior", "none");
  }
  await client.request(
    "POST",
    `subscriptions/${encodeURIComponent(subscriptionId)}`,
    body,
    idempotencyKey,
  );
}

export async function createStripeTaxRate(
  client: StripeClient,
  input: { ruleId: string; label: string; rateBps: number; country: string },
): Promise<string> {
  const body = new URLSearchParams();
  body.set("display_name", input.label);
  body.set("percentage", (input.rateBps / 100).toFixed(2));
  body.set("inclusive", "false");
  body.set("country", input.country);
  body.set("metadata[tax_rule_id]", input.ruleId);
  const rate = await client.request("POST", "tax_rates", body, `linkbooks-tax-${input.ruleId}`);
  const id = typeof rate["id"] === "string" ? rate["id"] : "";
  if (!id) throw new Error("Stripe did not return a tax rate.");
  return id;
}

export async function createStripeRefund(
  client: StripeClient,
  input: { paymentIntentId: string; amountMinor: number; idempotencyKey: string; refundId: string },
): Promise<{ id: string; status: "succeeded" | "pending" | "failed" }> {
  const body = new URLSearchParams();
  body.set("payment_intent", input.paymentIntentId);
  body.set("amount", String(input.amountMinor));
  body.set("reason", "requested_by_customer");
  body.set("metadata[linkbooks_refund_id]", input.refundId);
  const refund = await client.request(
    "POST",
    "refunds",
    body,
    `linkbooks-refund-${input.idempotencyKey}`,
  );
  const status = refund["status"];
  return {
    id: String(refund["id"] ?? ""),
    status:
      status === "succeeded"
        ? "succeeded"
        : status === "failed" || status === "canceled"
          ? "failed"
          : "pending",
  };
}
