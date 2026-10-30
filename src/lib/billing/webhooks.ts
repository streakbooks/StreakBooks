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
      await applyRazorpay(raw, request.headers.get("x-razorpay-signature"));
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
  const object = event.data?.object ?? {};
  if (event.type === "checkout.session.completed") {
    await completeStripeCheckout(object);
    return;
  }
  if (event.type === "invoice.payment_failed") {
    const subscriptionId = stringValue(object["subscription"]);
    if (subscriptionId) await markProviderStatus("stripe", subscriptionId, "past_due");
    const { sendBillingNotice } = await import("@/lib/billing/notices");
    await sendBillingNotice({
      to: null,
      subject: "LinkBooks payment failed",
      text: "A subscription payment failed. The organisation becomes read-only after the grace period. Existing reports stay available.",
    });
    return;
  }
  if (event.type === "customer.subscription.deleted") {
    const subscriptionId = stringValue(object["id"]);
    if (subscriptionId) await markProviderStatus("stripe", subscriptionId, "cancelled");
    return;
  }
  if (event.type === "customer.subscription.updated") {
    await syncStripeSubscription(object);
  }
}

async function completeStripeCheckout(session: Record<string, unknown>): Promise<void> {
  const checkoutId = metadataValue(session, "checkout_id");
  const subscriptionId = stringValue(session["subscription"]);
  const customerId = stringValue(session["customer"]);
  if (!checkoutId || !subscriptionId) return;
  const secret = process.env["STRIPE_SECRET_KEY"];
  let periodEnd: string | null = null;
  let cancelAtPeriodEnd = false;
  let interval: string | undefined;
  if (secret) {
    const response = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (response.ok) {
      const subscription = (await response.json()) as Record<string, unknown>;
      periodEnd = unixToIso(subscription["current_period_end"]);
      cancelAtPeriodEnd = subscription["cancel_at_period_end"] === true;
      interval = stripeInterval(subscription);
    }
  }
  const planCode = metadataValue(session, "plan_code");
  const currency = metadataValue(session, "currency");
  const billedInterval = metadataValue(session, "billing_interval") ?? interval;
  const unitAmount = Number(metadataValue(session, "unit_amount"));
  await activateCheckout(checkoutId, {
    status: "active",
    provider: "stripe",
    provider_customer_id: customerId,
    provider_subscription_id: subscriptionId,
    current_period_end: periodEnd,
    cancel_at_period_end: cancelAtPeriodEnd,
    ...(planCode ? { plan_code: planCode } : {}),
    ...(currency ? { currency } : {}),
    ...(billedInterval ? { billing_interval: billedInterval } : {}),
    ...(Number.isInteger(unitAmount) && unitAmount > 0 ? { unit_amount_minor: unitAmount } : {}),
    updated_at: new Date().toISOString(),
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
    : stripeStatus === "past_due" || stripeStatus === "unpaid"
      ? "past_due"
      : stripeStatus === "canceled"
        ? "cancelled"
        : "active";
  await markProviderStatus("stripe", subscriptionId, status, {
    current_period_end: unixToIso(subscription["current_period_end"]),
    cancel_at_period_end: subscription["cancel_at_period_end"] === true,
  });
}

async function applyRazorpay(raw: string, header: string | null): Promise<void> {
  const secret = process.env["RAZORPAY_WEBHOOK_SECRET"] ?? "";
  verifyRazorpaySignature(raw, header, secret);
  const event = JSON.parse(raw) as {
    event?: string;
    payload?: { subscription?: { entity?: Record<string, unknown> } };
  };
  if (!event.event) throw new Error("Razorpay event is malformed.");
  const entity = event.payload?.subscription?.entity ?? {};
  const eventId = stringValue(entity["id"]) ? `${event.event}:${stringValue(entity["id"])}` : null;
  const fresh = await beginEvent("razorpay", eventId, event.event, null);
  if (!fresh) return;
  const checkoutId = notesValue(entity, "checkout_id");
  const status = razorpayStatus(event.event);
  if (!checkoutId || !status) return;
  const periodEnd = unixToIso(entity["current_end"]) ?? unixToIso(entity["end_at"]);
  const planCode = notesValue(entity, "plan_code");
  const currency = notesValue(entity, "currency");
  const billedInterval = notesValue(entity, "billing_interval");
  const unitAmount = Number(notesValue(entity, "unit_amount"));
  await activateCheckout(checkoutId, {
    status,
    provider: "razorpay",
    provider_subscription_id: stringValue(entity["id"]),
    current_period_end: periodEnd,
    cancel_at_period_end: status === "cancelled",
    ...(planCode ? { plan_code: planCode } : {}),
    ...(currency ? { currency } : {}),
    ...(billedInterval ? { billing_interval: billedInterval } : {}),
    ...(Number.isInteger(unitAmount) && unitAmount > 0 ? { unit_amount_minor: unitAmount } : {}),
    updated_at: new Date().toISOString(),
  });
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
