import { verifyRazorpaySignature, verifyStripeSignature } from "@/lib/billing/signatures";

type AdminUpdate = {
  plan_code?: string;
  status: string;
  billing_interval?: string;
  provider: string;
  provider_customer_id?: string | null;
  provider_subscription_id?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  offer_code?: string | null;
  currency?: string;
  unit_amount_minor?: number;
  updated_at: string;
};

export async function handleBillingWebhook(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const raw = await request.text();
  try {
    if (url.pathname === "/api/billing/stripe") {
      await applyStripe(raw, request.headers.get("stripe-signature"));
    } else if (url.pathname === "/api/billing/razorpay") {
      await applyRazorpay(
        raw,
        request.headers.get("x-razorpay-signature"),
        request.headers.get("x-razorpay-event-id"),
      );
    } else {
      return new Response("Not found", { status: 404 });
    }
    return Response.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook failed";
    const status = /signature|configured|malformed|time window/i.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}

async function applyStripe(raw: string, header: string | null): Promise<void> {
  const secret = process.env["STRIPE_WEBHOOK_SECRET"] ?? "";
  verifyStripeSignature(raw, header, secret, Math.floor(Date.now() / 1000));
  const event = JSON.parse(raw) as {
    id?: string;
    type?: string;
    data?: { object?: Record<string, unknown> };
  };
  if (!event.id || !event.type) throw new Error("Stripe event is malformed.");
  const fresh = await beginEvent("stripe", event.id, event.type, null);
  if (!fresh) return;
  try {
    const object = event.data?.object ?? {};
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      await completeStripeCheckout(object);
    } else if (event.type === "invoice.paid") {
      const subscriptionId = stripeInvoiceSubscriptionId(object);
      if (subscriptionId) {
        await completePaidStripeInvoice(subscriptionId);
        await applyScheduledPlan("stripe", subscriptionId);
      }
    } else if (event.type === "invoice.payment_failed") {
      const subscriptionId = stripeInvoiceSubscriptionId(object);
      if (subscriptionId) await markProviderStatus("stripe", subscriptionId, "past_due");
      const { sendBillingNotice } = await import("@/lib/billing/notices");
      await sendBillingNotice({
        to: null,
        subject: "LinkBooks payment failed",
        text: "A subscription payment failed. The organisation becomes read-only after the grace period. Existing reports stay available.",
      });
    } else if (event.type === "customer.subscription.deleted") {
      const subscriptionId = stringValue(object["id"]);
      if (subscriptionId) await markProviderStatus("stripe", subscriptionId, "cancelled");
    } else if (event.type === "customer.subscription.updated") {
      await syncStripeSubscription(object);
    }
  } catch (error) {
    await clearFailedEvent("stripe", event.id);
    throw error;
  }
}

export function mayActivateStripeCheckout(
  paymentStatus: string | null,
  subscriptionStatus: string | null,
): boolean {
  return (
    (paymentStatus === "paid" && (subscriptionStatus === "active" || subscriptionStatus === "trialing")) ||
    (paymentStatus === "no_payment_required" && subscriptionStatus === "trialing")
  );
}

async function readStripeSubscription(subscriptionId: string): Promise<Record<string, unknown>> {
  const secret = process.env["STRIPE_SECRET_KEY"];
  if (!secret) throw new Error("Stripe API secret is not configured.");
  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!response.ok) throw new Error(`Stripe subscription lookup failed (${response.status}).`);
  return (await response.json()) as Record<string, unknown>;
}

function stripeInvoiceSubscriptionId(invoice: Record<string, unknown>): string | null {
  const legacy = stringValue(invoice["subscription"]);
  if (legacy) return legacy;
  const parent = invoice["parent"] as Record<string, unknown> | undefined;
  const details = parent?.["subscription_details"] as Record<string, unknown> | undefined;
  return stringValue(details?.["subscription"]);
}

async function completeStripeCheckout(session: Record<string, unknown>): Promise<void> {
  const checkoutId = metadataValue(session, "checkout_id");
  const subscriptionId = stringValue(session["subscription"]);
  const customerId = stringValue(session["customer"]);
  if (!checkoutId || !subscriptionId) return;
  const subscription = await readStripeSubscription(subscriptionId);
  const status = stringValue(subscription["status"]);
  if (!mayActivateStripeCheckout(stringValue(session["payment_status"]), status)) return;
  await activateCheckout(checkoutId, {
    status: status === "trialing" ? "trialing" : "active",
    provider: "stripe",
    provider_customer_id: customerId,
    provider_subscription_id: subscriptionId,
    current_period_end: unixToIso(subscription["current_period_end"]),
    cancel_at_period_end: subscription["cancel_at_period_end"] === true,
    updated_at: new Date().toISOString(),
  });
}

async function completePaidStripeInvoice(subscriptionId: string): Promise<void> {
  const subscription = await readStripeSubscription(subscriptionId);
  if (subscription["status"] !== "active" && subscription["status"] !== "trialing") return;
  const checkoutId = metadataValue(subscription, "checkout_id");
  if (checkoutId) {
    await activateCheckout(checkoutId, {
      status: subscription["status"] === "trialing" ? "trialing" : "active",
      provider: "stripe",
      provider_customer_id: stringValue(subscription["customer"]),
      provider_subscription_id: subscriptionId,
      current_period_end: unixToIso(subscription["current_period_end"]),
      cancel_at_period_end: subscription["cancel_at_period_end"] === true,
      updated_at: new Date().toISOString(),
    });
  }
  await markProviderStatus("stripe", subscriptionId, "active", {
    current_period_end: unixToIso(subscription["current_period_end"]),
    cancel_at_period_end: subscription["cancel_at_period_end"] === true,
  });
}

async function syncStripeSubscription(subscription: Record<string, unknown>): Promise<void> {
  const subscriptionId = stringValue(subscription["id"]);
  if (!subscriptionId) return;
  const stripeStatus = stringValue(subscription["status"]);
  const paused =
    subscription["pause_collection"] != null && subscription["pause_collection"] !== false;
  const status = paused
    ? "paused"
    : stripeStatus === "past_due" || stripeStatus === "unpaid" || stripeStatus === "incomplete"
      ? "past_due"
      : stripeStatus === "canceled" || stripeStatus === "incomplete_expired"
        ? "cancelled"
        : stripeStatus === "trialing"
          ? "trialing"
          : stripeStatus === "active"
            ? "active"
            : null;
  if (!status) return;
  await markProviderStatus("stripe", subscriptionId, status, {
    current_period_end: unixToIso(subscription["current_period_end"]),
    cancel_at_period_end: subscription["cancel_at_period_end"] === true,
  });
}

async function applyRazorpay(
  raw: string,
  header: string | null,
  eventIdHeader: string | null,
): Promise<void> {
  const secret = process.env["RAZORPAY_WEBHOOK_SECRET"] ?? "";
  verifyRazorpaySignature(raw, header, secret);
  const event = JSON.parse(raw) as {
    event?: string;
    payload?: { subscription?: { entity?: Record<string, unknown> } };
  };
  if (!event.event) throw new Error("Razorpay event is malformed.");
  // The subscription ID repeats for every renewal. Only the provider's unique
  // x-razorpay-event-id header can safely deduplicate delivery attempts.
  if (!eventIdHeader || !/^[a-zA-Z0-9_-]{8,160}$/.test(eventIdHeader)) {
    throw new Error("Razorpay event id is malformed.");
  }
  const fresh = await beginEvent("razorpay", eventIdHeader, event.event, null);
  if (!fresh) return;
  try {
    const entity = event.payload?.subscription?.entity ?? {};
    const checkoutId = notesValue(entity, "checkout_id");
    const status = razorpayStatus(event.event);
    if (!checkoutId || !status) return;
    const periodEnd = unixToIso(entity["current_end"]) ?? unixToIso(entity["end_at"]);
    await activateCheckout(checkoutId, {
      status,
      provider: "razorpay",
      provider_subscription_id: stringValue(entity["id"]),
      current_period_end: periodEnd,
      cancel_at_period_end: status === "cancelled",
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    await clearFailedEvent("razorpay", eventIdHeader);
    throw error;
  }
}

function razorpayStatus(event: string): string | null {
  if (
    event === "subscription.activated" ||
    event === "subscription.charged" ||
    event === "subscription.resumed"
  ) {
    return "active";
  }
  if (event === "subscription.halted" || event === "subscription.pending") return "past_due";
  if (event === "subscription.cancelled" || event === "subscription.completed") return "cancelled";
  return null;
}

async function beginEvent(
  provider: string,
  eventId: string | null,
  eventType: string,
  companyId: string | null,
): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("billing_events" as never).insert({
    company_id: companyId,
    provider,
    event_id: eventId,
    event_type: eventType,
  } as never);
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(error.message);
}

async function clearFailedEvent(provider: string, eventId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("billing_events" as never)
    .delete()
    .eq("provider" as never, provider as never)
    .eq("event_id" as never, eventId as never);
  if (error) throw new Error(error.message);
}

async function activateCheckout(checkoutId: string, patch: AdminUpdate): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: checkout, error } = await supabaseAdmin
    .from("billing_checkouts" as never)
    .select(
      "company_id, plan_code, billing_interval, currency, unit_amount_minor, offer_code, status" as never,
    )
    .eq("id" as never, checkoutId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = checkout as {
    company_id: string;
    plan_code: string;
    billing_interval: string;
    currency: string;
    unit_amount_minor: number;
    offer_code: string | null;
    status: string;
  } | null;
  if (!row) return;
  const { error: subError } = await supabaseAdmin.from("company_subscriptions" as never).upsert(
    {
      company_id: row.company_id,
      plan_code: patch.plan_code ?? row.plan_code,
      billing_interval: patch.billing_interval ?? row.billing_interval,
      currency: patch.currency ?? row.currency,
      unit_amount_minor: patch.unit_amount_minor ?? row.unit_amount_minor,
      offer_code: patch.offer_code === undefined ? row.offer_code : patch.offer_code,
      ...patch,
    } as never,
    { onConflict: "company_id" } as never,
  );
  if (subError) throw new Error(subError.message);
  if (row.status === "open") {
    await supabaseAdmin
      .from("billing_checkouts" as never)
      .update({ status: "complete" } as never)
      .eq("id" as never, checkoutId as never);
    if (row.offer_code) await incrementOffer(row.offer_code);
  }
}

async function applyScheduledPlan(provider: string, providerSubscriptionId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("company_subscriptions" as never)
    .select("company_id, scheduled_plan_code, scheduled_at, currency, billing_interval" as never)
    .eq("provider" as never, provider as never)
    .eq("provider_subscription_id" as never, providerSubscriptionId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as {
    company_id: string;
    scheduled_plan_code: string | null;
    scheduled_at: string | null;
    currency: string;
    billing_interval: string;
  } | null;
  if (!row?.scheduled_plan_code) return;
  if (row.scheduled_at && Date.parse(row.scheduled_at) > Date.now()) return;
  const { data: version } = await supabaseAdmin
    .from("plan_versions" as never)
    .select("id" as never)
    .eq("plan_code" as never, row.scheduled_plan_code as never)
    .eq("status" as never, "published" as never)
    .order("version_no" as never, { ascending: false } as never)
    .limit(1)
    .maybeSingle();
  const versionId = (version as { id: string } | null)?.id ?? null;
  let amount: number | null = null;
  if (versionId) {
    const { data: price } = await supabaseAdmin
      .from("plan_prices" as never)
      .select("amount_minor" as never)
      .eq("version_id" as never, versionId as never)
      .eq("currency" as never, row.currency as never)
      .eq("billing_interval" as never, row.billing_interval as never)
      .maybeSingle();
    amount = (price as { amount_minor: number } | null)?.amount_minor ?? null;
  }
  const { error: updateError } = await supabaseAdmin
    .from("company_subscriptions" as never)
    .update({
      plan_code: row.scheduled_plan_code,
      price_version_id: versionId,
      ...(amount != null ? { unit_amount_minor: amount } : {}),
      scheduled_plan_code: null,
      scheduled_at: null,
      grandfathered: false,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("company_id" as never, row.company_id as never);
  if (updateError) throw new Error(updateError.message);
}

async function markProviderStatus(
  provider: string,
  providerSubscriptionId: string,
  status: string,
  extra: { current_period_end?: string | null; cancel_at_period_end?: boolean } = {},
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("company_subscriptions" as never)
    .update({ status, ...extra, updated_at: new Date().toISOString() } as never)
    .eq("provider" as never, provider as never)
    .eq("provider_subscription_id" as never, providerSubscriptionId as never);
  if (error) throw new Error(error.message);
}

async function incrementOffer(code: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc(
    "redeem_billing_offer" as never,
    { _code: code } as never,
  );
  if (!error) return;
  if (error.code === "42883" || error.code === "PGRST202") return;
  throw new Error(error.message);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function metadataValue(object: Record<string, unknown>, key: string): string | null {
  const metadata = object["metadata"];
  if (!metadata || typeof metadata !== "object") return null;
  return stringValue((metadata as Record<string, unknown>)[key]);
}

function notesValue(object: Record<string, unknown>, key: string): string | null {
  const notes = object["notes"];
  if (!notes || typeof notes !== "object") return null;
  return stringValue((notes as Record<string, unknown>)[key]);
}

function unixToIso(value: unknown): string | null {
  const seconds =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function stripeInterval(subscription: Record<string, unknown>): string | undefined {
  const items = subscription["items"] as
    { data?: Array<{ price?: { recurring?: { interval?: string } } }> } | undefined;
  const interval = items?.data?.[0]?.price?.recurring?.interval;
  return interval === "year" || interval === "month" ? interval : undefined;
}
