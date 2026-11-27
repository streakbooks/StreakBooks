import { assertStripeTestKey } from "@/lib/billing/provider-keys";
import {
  STRIPE_API_VERSION,
  modeFromStripeSecret,
  stripePeriodEnd,
  type PaymentMode,
} from "@/lib/billing/providers/normalise";

/** Server-only Stripe client. Test keys unless STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS=true. */
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
  body.set("product_data[name]", `StreakBooks ${input.planName}`);
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
  couponId?: string | null;
}): URLSearchParams {
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("success_url", input.successUrl);
  body.set("cancel_url", input.cancelUrl);
  body.set("client_reference_id", input.checkoutId);
  body.set("line_items[0][price]", input.priceId);
  body.set("line_items[0][quantity]", "1");
  if (input.taxRateId) body.set("line_items[0][tax_rates][0]", input.taxRateId);
  if (input.couponId) body.set("discounts[0][coupon]", input.couponId);
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
  body.set(
    "custom_text[submit][message]",
    "After payment you will return to StreakBooks to confirm your subscription.",
  );
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
 * Upgrade: prorated invoice now; keep current plan until paid (`pending_if_incomplete`).
 * Downgrade: new price from the next invoice, no proration.
 * Payment UX: open Stripe's hosted invoice page (standard SaaS mid-cycle upgrade).
 */
export type StripePlanChangeResult = {
  subscription: Record<string, unknown>;
  paymentActionUrl: string | null;
  invoiceId: string | null;
  amountDueMinor: number;
  alreadyOnPrice: boolean;
};

export function stripePlanChangeSuccessUrl(origin: string): string {
  return `${origin}/settings?section=subscription&plan_change=success`;
}

export function stripePlanChangeCancelUrl(origin: string): string {
  return `${origin}/settings?section=subscription&plan_change=cancel`;
}

/** Fresh key each attempt so Stripe never rejects parameter changes (common retry failure). */
export function stripePlanChangeIdempotencyKey(
  companyId: string,
  planPriceId: string,
  kind: "upgrade" | "downgrade",
): string {
  const nonce =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `sb-plan-${kind}-${companyId.slice(0, 8)}-${planPriceId.slice(0, 8)}-${nonce}`;
}

function firstSubscriptionItem(subscription: Record<string, unknown>): {
  id: string;
  priceId: string | null;
} | null {
  const items = subscription["items"] as { data?: Record<string, unknown>[] } | undefined;
  const item = items?.data?.[0];
  if (!item || typeof item["id"] !== "string") return null;
  const price = item["price"];
  const priceId =
    typeof price === "string"
      ? price
      : price && typeof price === "object" && typeof (price as { id?: string }).id === "string"
        ? (price as { id: string }).id
        : null;
  return { id: item["id"], priceId };
}

async function stripePriceInterval(
  client: StripeClient,
  priceId: string | null,
): Promise<"month" | "year" | null> {
  if (!priceId) return null;
  const price = await client.request("GET", `prices/${encodeURIComponent(priceId)}`);
  const recurring = price["recurring"];
  const interval =
    recurring && typeof recurring === "object" && !Array.isArray(recurring)
      ? (recurring as { interval?: string }).interval
      : null;
  return interval === "month" || interval === "year" ? interval : null;
}

function invoiceIdFrom(subscription: Record<string, unknown>): string | null {
  const latest = subscription["latest_invoice"];
  if (typeof latest === "string") return latest;
  if (latest && typeof latest === "object" && typeof (latest as { id?: string }).id === "string") {
    return (latest as { id: string }).id;
  }
  return null;
}

async function loadInvoice(
  client: StripeClient,
  invoiceId: string,
): Promise<Record<string, unknown>> {
  return client.request(
    "GET",
    `invoices/${encodeURIComponent(invoiceId)}?expand[]=payment_intent`,
  );
}

/** Stripe's hosted invoice pay page — the standard mid-cycle upgrade payment screen. */
export async function stripeHostedInvoicePaymentUrl(
  client: StripeClient,
  invoiceId: string,
): Promise<{ url: string | null; amountDueMinor: number; status: string | null }> {
  let invoice = await loadInvoice(client, invoiceId);
  let status = typeof invoice["status"] === "string" ? invoice["status"] : null;
  let amountDue = Number(invoice["amount_due"] ?? 0);
  let hosted =
    typeof invoice["hosted_invoice_url"] === "string" ? invoice["hosted_invoice_url"] : null;

  // Draft invoices need finalising before a hosted pay URL exists.
  if (status === "draft") {
    invoice = await client.request(
      "POST",
      `invoices/${encodeURIComponent(invoiceId)}/finalize`,
      new URLSearchParams(),
    );
    status = typeof invoice["status"] === "string" ? invoice["status"] : null;
    amountDue = Number(invoice["amount_due"] ?? 0);
    hosted =
      typeof invoice["hosted_invoice_url"] === "string" ? invoice["hosted_invoice_url"] : null;
  }

  if (status === "paid" || amountDue <= 0) {
    return { url: null, amountDueMinor: 0, status };
  }
  if (status === "open" && hosted) {
    return { url: hosted, amountDueMinor: amountDue, status };
  }

  const pi = invoice["payment_intent"];
  const piObj =
    pi && typeof pi === "object" && !Array.isArray(pi) ? (pi as Record<string, unknown>) : null;
  const nextAction = piObj?.["next_action"] as { redirect_to_url?: { url?: string } } | undefined;
  const redirect = nextAction?.redirect_to_url?.url;
  if (typeof redirect === "string" && redirect.length > 0) {
    return { url: redirect, amountDueMinor: amountDue, status };
  }

  return { url: hosted, amountDueMinor: amountDue, status };
}

/**
 * Finds an open invoice that already bills the target price (retry / interrupted upgrade).
 * Avoids creating a second proration when the user clicks Confirm again.
 */
async function findOpenInvoiceForPrice(
  client: StripeClient,
  subscriptionId: string,
  priceId: string,
): Promise<{ invoiceId: string; url: string; amountDueMinor: number } | null> {
  const list = await client.request(
    "GET",
    `invoices?subscription=${encodeURIComponent(subscriptionId)}&status=open&limit=5`,
  );
  const rows = Array.isArray(list["data"]) ? (list["data"] as Record<string, unknown>[]) : [];
  for (const invoice of rows) {
    const id = typeof invoice["id"] === "string" ? invoice["id"] : null;
    if (!id) continue;
    const lines = invoice["lines"] as { data?: Record<string, unknown>[] } | undefined;
    const matches = (lines?.data ?? []).some((line) => {
      const price = line["price"];
      const linePrice =
        typeof price === "string"
          ? price
          : price && typeof price === "object"
            ? (price as { id?: string }).id
            : null;
      return linePrice === priceId;
    });
    if (!matches) continue;
    const pay = await stripeHostedInvoicePaymentUrl(client, id);
    if (pay.url) return { invoiceId: id, url: pay.url, amountDueMinor: pay.amountDueMinor };
  }
  return null;
}

export async function stripeChangePrice(
  client: StripeClient,
  subscriptionId: string,
  priceId: string,
  kind: "upgrade" | "downgrade",
  idempotencyKey: string,
  options?: { prorationDateUnix?: number | null },
): Promise<StripePlanChangeResult> {
  const subscription = await client.request(
    "GET",
    `subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
  const item = firstSubscriptionItem(subscription);
  if (!item) throw new Error("Stripe did not return the subscription item.");

  // Already on the target price (webhook/sync may have completed between clicks).
  if (item.priceId === priceId) {
    return {
      subscription,
      paymentActionUrl: null,
      invoiceId: null,
      amountDueMinor: 0,
      alreadyOnPrice: true,
    };
  }

  // Interrupted upgrade: reuse the open invoice instead of updating again.
  if (kind === "upgrade") {
    const existing = await findOpenInvoiceForPrice(client, subscriptionId, priceId);
    if (existing) {
      return {
        subscription,
        paymentActionUrl: existing.url,
        invoiceId: existing.invoiceId,
        amountDueMinor: existing.amountDueMinor,
        alreadyOnPrice: false,
      };
    }
  }

  // Stripe rejects billing_cycle_anchor=unchanged when the recurring interval changes
  // (month ↔ year). Detect that so downgrades stay period-anchored only for same-interval moves.
  const currentInterval = await stripePriceInterval(client, item.priceId);
  const targetInterval = await stripePriceInterval(client, priceId);
  const intervalChanged =
    Boolean(currentInterval && targetInterval) && currentInterval !== targetInterval;

  const body = new URLSearchParams();
  body.set("items[0][id]", item.id);
  body.set("items[0][price]", priceId);
  if (kind === "upgrade") {
    // Keep current entitlements until the prorated invoice is paid (Stripe recommended).
    body.set("proration_behavior", "always_invoice");
    body.set("payment_behavior", "pending_if_incomplete");
    // Same proration_date as invoice preview so due-today matches the confirmation UI.
    if (
      typeof options?.prorationDateUnix === "number" &&
      Number.isFinite(options.prorationDateUnix) &&
      options.prorationDateUnix > 0
    ) {
      body.set("proration_date", String(Math.floor(options.prorationDateUnix)));
    }
    if (!intervalChanged) {
      body.set("billing_cycle_anchor", "unchanged");
    }
  } else {
    // Netflix-style same-interval: new price on next invoice; no credit/charge today.
    body.set("proration_behavior", "none");
    if (!intervalChanged) {
      body.set("billing_cycle_anchor", "unchanged");
    }
  }
  body.set("expand[]", "latest_invoice");

  const updated = await client.request(
    "POST",
    `subscriptions/${encodeURIComponent(subscriptionId)}`,
    body,
    idempotencyKey,
  );

  if (kind !== "upgrade") {
    return {
      subscription: updated,
      paymentActionUrl: null,
      invoiceId: invoiceIdFrom(updated),
      amountDueMinor: 0,
      alreadyOnPrice: false,
    };
  }

  const invoiceId = invoiceIdFrom(updated);
  if (!invoiceId) {
    throw new Error("Stripe did not create an invoice for this upgrade. Try again in a moment.");
  }
  const pay = await stripeHostedInvoicePaymentUrl(client, invoiceId);
  if (pay.amountDueMinor > 0 && !pay.url) {
    throw new Error(
      "Stripe created the upgrade invoice but no payment page is ready yet. Wait a few seconds and try again.",
    );
  }
  return {
    subscription: updated,
    paymentActionUrl: pay.url,
    invoiceId,
    amountDueMinor: pay.amountDueMinor,
    alreadyOnPrice: false,
  };
}

export type StripePlanPreview = {
  amountDueMinor: number;
  currency: string;
  creditMinor: number;
  chargeMinor: number;
  taxMinor: number;
  prorationDateUnix: number;
  periodEndUnix: number | null;
  lines: { description: string; amountMinor: number }[];
};

function stripePreviewTaxMinor(preview: Record<string, unknown>): number {
  const tax = Number(preview["tax"] ?? 0);
  if (Number.isFinite(tax) && tax !== 0) return Math.abs(Math.round(tax));
  const totals = preview["total_tax_amounts"];
  if (Array.isArray(totals)) {
    const sum = totals.reduce((acc, row) => {
      if (!row || typeof row !== "object") return acc;
      const amount = Number((row as { amount?: unknown }).amount ?? 0);
      return acc + (Number.isFinite(amount) ? amount : 0);
    }, 0);
    if (sum !== 0) return Math.abs(Math.round(sum));
  }
  return 0;
}

/**
 * Preview prorated charge/credit before confirming a plan or interval change (Xero-style).
 * Does not mutate the subscription. Pins proration_date for later confirm alignment.
 */
export async function stripePreviewPlanChange(
  client: StripeClient,
  subscriptionId: string,
  priceId: string,
  kind: "upgrade" | "downgrade",
  options?: { prorationDateUnix?: number },
): Promise<StripePlanPreview> {
  const subscription = await client.request(
    "GET",
    `subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
  const item = firstSubscriptionItem(subscription);
  if (!item) throw new Error("Stripe did not return the subscription item.");
  const customer =
    typeof subscription["customer"] === "string"
      ? subscription["customer"]
      : subscription["customer"] &&
          typeof subscription["customer"] === "object" &&
          typeof (subscription["customer"] as { id?: string }).id === "string"
        ? (subscription["customer"] as { id: string }).id
        : null;
  if (!customer) throw new Error("Stripe subscription has no customer.");

  const prorationDateUnix =
    typeof options?.prorationDateUnix === "number" && Number.isFinite(options.prorationDateUnix)
      ? Math.floor(options.prorationDateUnix)
      : Math.floor(Date.now() / 1000);
  const periodEndUnix =
    typeof subscription["current_period_end"] === "number"
      ? subscription["current_period_end"]
      : null;

  const params = new URLSearchParams();
  params.set("customer", customer);
  params.set("subscription", subscriptionId);
  params.set("subscription_details[items][0][id]", item.id);
  params.set("subscription_details[items][0][price]", priceId);
  params.set(
    "subscription_details[proration_behavior]",
    kind === "upgrade" ? "create_prorations" : "none",
  );
  if (kind === "upgrade") {
    params.set("subscription_details[proration_date]", String(prorationDateUnix));
  }

  let preview: Record<string, unknown>;
  try {
    preview = await client.request("POST", "invoices/create_preview", params);
  } catch {
    // Older fallback: upcoming invoice query.
    const query = new URLSearchParams();
    query.set("customer", customer);
    query.set("subscription", subscriptionId);
    query.set("subscription_items[0][id]", item.id);
    query.set("subscription_items[0][price]", priceId);
    query.set(
      "subscription_proration_behavior",
      kind === "upgrade" ? "create_prorations" : "none",
    );
    if (kind === "upgrade") {
      query.set("subscription_proration_date", String(prorationDateUnix));
    }
    preview = await client.request("GET", `invoices/upcoming?${query.toString()}`);
  }

  const currency = String(preview["currency"] ?? "gbp").toUpperCase();
  const amountDue = Number(preview["amount_due"] ?? 0);
  const linesRaw = (preview["lines"] as { data?: Record<string, unknown>[] } | undefined)?.data ?? [];
  const lines = linesRaw.slice(0, 8).map((line) => ({
    description: String(line["description"] ?? "Line"),
    amountMinor: Number(line["amount"] ?? 0),
  }));
  const creditMinor = lines.filter((l) => l.amountMinor < 0).reduce((s, l) => s + l.amountMinor, 0);
  const chargeMinor = lines.filter((l) => l.amountMinor > 0).reduce((s, l) => s + l.amountMinor, 0);
  return {
    amountDueMinor: amountDue,
    currency,
    creditMinor: Math.abs(creditMinor),
    chargeMinor,
    taxMinor: stripePreviewTaxMinor(preview),
    prorationDateUnix,
    periodEndUnix,
    lines,
  };
}

/** Maps Stripe/API wording into short customer-facing upgrade errors. */
export function friendlyStripePlanChangeError(message: string): string {
  const key = message.toLowerCase();
  if (key.includes("idempoten")) {
    return "That upgrade was already started. Confirm again to open the Stripe payment page, or wait a few seconds and retry.";
  }
  if (key.includes("billing cycle unchanged") || key.includes("changing plan intervals")) {
    return "That billing period switch could not be applied. Refresh and try again, or contact support if it keeps failing.";
  }
  if (key.includes("no such subscription") || key.includes("resource_missing")) {
    return "We could not find this organisation's Stripe subscription. Use Subscribe to start a new plan, or Manage billing.";
  }
  if (key.includes("card") && (key.includes("declined") || key.includes("insufficient"))) {
    return "The card on file was declined. Update the card in Manage billing, then try the upgrade again.";
  }
  if (key.includes("payment_intent") || key.includes("requires_action")) {
    return "Stripe needs you to confirm the payment. Open the payment page to finish.";
  }
  if (key.includes("test") && key.includes("live")) {
    return "Stripe is using the wrong mode (test vs live). Check the server API keys and try again.";
  }
  return message;
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

export type CouponTerms = {
  code: string;
  kind: "percent" | "amount";
  percentBps: number;
  amountMinor: number;
  currency: string;
  durationType: "once" | "repeating" | "forever";
  durationMonths: number | null;
};

/** One Stripe coupon per StreakBooks code and currency (the database keeps the mapping). */
export async function createStripeCoupon(
  client: StripeClient,
  terms: CouponTerms,
): Promise<string> {
  const body = new URLSearchParams();
  body.set("name", terms.code);
  if (terms.kind === "percent") {
    body.set("percent_off", (terms.percentBps / 100).toFixed(2));
  } else {
    body.set("amount_off", String(terms.amountMinor));
    body.set("currency", terms.currency.toLowerCase());
  }
  body.set("duration", terms.durationType);
  if (terms.durationType === "repeating" && terms.durationMonths) {
    body.set("duration_in_months", String(terms.durationMonths));
  }
  body.set("metadata[linkbooks_code]", terms.code);
  const coupon = await client.request(
    "POST",
    "coupons",
    body,
    `linkbooks-coupon-${terms.code}-${terms.currency}`,
  );
  const id = typeof coupon["id"] === "string" ? coupon["id"] : "";
  if (!id) throw new Error("Stripe did not return a coupon.");
  return id;
}
