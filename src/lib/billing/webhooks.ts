import {
  STRIPE_STATE_EVENTS,
  modeFromRazorpayKey,
  obj,
  razorpayEvents,
  razorpayPayment,
  razorpayRefund,
  str,
  stripeCheckoutId,
  stripeInvoiceSubscriptionId,
  stripeInvoicePayment,
  stripeRefund,
  stripeStateEvent,
  stripeSubscriptionState,
  mayActivateStripeCheckout,
  unixToIso,
  type NormalisedEvent,
  type NormalisedPayment,
  type NormalisedRefund,
  type ProviderId,
  type RazorpayEvent,
} from "@/lib/billing/providers/normalise";
import { verifyRazorpaySignature, verifyStripeSignature } from "@/lib/billing/signatures";

export { mayActivateStripeCheckout };

/**
 * Provider webhooks. Each delivery is verified on the raw body, stored durably (deduplicated by
 * provider event id) and then processed through public.billing_apply_provider_event, which
 * changes subscriptions in one transaction and ignores stale events. A processing failure keeps
 * the payload, schedules a retry and returns 500 so the provider also redelivers.
 * Browser redirects never grant access.
 */
type Admin = {
  rpc: (
    fn: never,
    args?: never,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
};

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

async function rpc<T>(client: Admin, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

type Received = {
  provider: ProviderId;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string | null;
  mode: "test" | "live";
};

function receiveStripe(raw: string, header: string | null): Received {
  verifyStripeSignature(
    raw,
    header,
    process.env["STRIPE_WEBHOOK_SECRET"] ?? "",
    Math.floor(Date.now() / 1000),
  );
  const event = JSON.parse(raw) as Record<string, unknown>;
  const eventId = str(event["id"]);
  const eventType = str(event["type"]);
  if (!eventId || !eventType) throw new Error("Stripe event is malformed.");
  return {
    provider: "stripe",
    eventId,
    eventType,
    payload: event,
    createdAt: unixToIso(event["created"]),
    mode: event["livemode"] === true ? "live" : "test",
  };
}

function receiveRazorpay(
  raw: string,
  header: string | null,
  eventIdHeader: string | null,
): Received {
  verifyRazorpaySignature(raw, header, process.env["RAZORPAY_WEBHOOK_SECRET"] ?? "");
  const event = JSON.parse(raw) as Record<string, unknown>;
  const eventType = str(event["event"]);
  if (!eventType) throw new Error("Razorpay event is malformed.");
  // The subscription id repeats for every renewal; only the delivery's event id is unique.
  if (!eventIdHeader || !/^[a-zA-Z0-9_-]{8,160}$/.test(eventIdHeader)) {
    throw new Error("Razorpay event id is malformed.");
  }
  return {
    provider: "razorpay",
    eventId: eventIdHeader,
    eventType,
    payload: event,
    createdAt: unixToIso(event["created_at"]),
    mode: modeFromRazorpayKey(process.env["RAZORPAY_KEY_ID"] ?? ""),
  };
}

export async function handleBillingWebhook(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const raw = await request.text();
  let received: Received;
  try {
    if (url.pathname === "/api/billing/stripe") {
      received = receiveStripe(raw, request.headers.get("stripe-signature"));
    } else if (url.pathname === "/api/billing/razorpay") {
      received = receiveRazorpay(
        raw,
        request.headers.get("x-razorpay-signature"),
        request.headers.get("x-razorpay-event-id"),
      );
    } else {
      return new Response("Not found", { status: 404 });
    }
  } catch (error) {
    // Invalid signatures and malformed bodies are not stored.
    const message = error instanceof Error ? error.message : "Webhook rejected";
    const status = /configured/i.test(message) ? 500 : 400;
    return Response.json({ error: message }, { status });
  }
  try {
    const client = await admin();
    const stored = await rpc<{ id: string; status: string; fresh: boolean }>(
      client,
      "billing_webhook_receive",
      {
        _provider: received.provider,
        _event_id: received.eventId,
        _event_type: received.eventType,
        _payload: received.payload,
        _provider_created_at: received.createdAt,
        _mode: received.mode,
      },
    );
    if (stored.status === "processed" || stored.status === "skipped" || stored.status === "dead") {
      return Response.json({ received: true, duplicate: !stored.fresh });
    }
    const outcome = await processStoredEvent(stored.id);
    if (outcome === "failed")
      return Response.json({ error: "Processing failed; retry scheduled" }, { status: 500 });
    return Response.json({ received: true });
  } catch (error) {
    console.error("Billing webhook storage failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "Webhook could not be stored" }, { status: 500 });
  }
}

type Claimed = {
  id: string;
  provider: ProviderId;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  providerCreatedAt: string | null;
  mode: "test" | "live" | null;
};

/** Processes one stored event. Returns the outcome, or "busy" when another worker holds it. */
export async function processStoredEvent(
  id: string,
): Promise<"processed" | "skipped" | "failed" | "busy"> {
  const client = await admin();
  const claimed = await rpc<Claimed | null>(client, "billing_webhook_claim", { _id: id });
  if (!claimed) return "busy";
  try {
    const events =
      claimed.provider === "stripe"
        ? await stripeToEvents(claimed)
        : razorpayEvents(claimed.payload as RazorpayEvent);
    const results: unknown[] = [];
    for (const event of events) {
      const result = await rpc<{ result: string; offerCode?: string | null }>(
        client,
        "billing_apply_provider_event",
        {
          _provider: claimed.provider,
          _event_id: claimed.eventId,
          _kind: event.kind,
          _data: event.data,
        },
      );
      results.push(result);
      if (event.kind === "checkout_completed" && result.result === "applied") {
        await rpc(client, "billing_redeem_coupon", { _checkout_id: event.data.checkoutId });
      }
      if (event.kind === "payment_failed" && result.result === "applied")
        await notifyPaymentFailed();
    }
    const payment =
      claimed.provider === "stripe"
        ? await stripePaymentFor(claimed)
        : razorpayPayment(claimed.payload as RazorpayEvent);
    if (payment) {
      const recorded = await rpc<{ result: string; reason?: string }>(
        client,
        "billing_record_provider_payment",
        { _provider: claimed.provider, _mode: claimed.mode ?? "test", _payment: payment },
      );
      // A payment can arrive before the checkout that created its subscription; retry later.
      if (recorded.result === "skipped" && recorded.reason === "unknown subscription") {
        throw new Error("The subscription for this payment is not active yet.");
      }
      results.push({ ...recorded, result: recorded.result === "skipped" ? "skipped" : "applied" });
    }
    const refund =
      claimed.provider === "stripe"
        ? stripeRefund(claimed.eventType, obj(obj(claimed.payload["data"])["object"]))
        : razorpayRefund(claimed.payload as RazorpayEvent);
    if (refund && refund.status !== "pending") {
      results.push(await applyRefund(client, claimed.provider, refund));
    }
    const status = results.some((item) => (item as { result?: string }).result === "applied")
      ? "processed"
      : "skipped";
    await rpc(client, "billing_webhook_finish", {
      _id: id,
      _status: status,
      _error: null,
      _result: results,
    });
    return status;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Processing failed";
    await rpc(client, "billing_webhook_finish", {
      _id: id,
      _status: "failed",
      _error: message,
      _result: null,
    });
    return "failed";
  }
}

/** Retries due events; called by the authenticated retry endpoint. */
export async function retryDueWebhooks(limit = 20): Promise<{ processed: number; failed: number }> {
  const client = await admin();
  const ids = await rpc<string[]>(client, "billing_webhook_due", { _limit: limit });
  let processed = 0;
  let failed = 0;
  for (const id of ids) {
    const outcome = await processStoredEvent(id);
    if (outcome === "failed") failed += 1;
    else if (outcome !== "busy") processed += 1;
  }
  return { processed, failed };
}

async function stripeToEvents(claimed: Claimed): Promise<NormalisedEvent[]> {
  const object = obj(obj(claimed.payload["data"])["object"]);
  const occurredAt = claimed.providerCreatedAt ?? new Date().toISOString();
  const type = claimed.eventType;
  const fetchSubscription = async (subscriptionId: string) => {
    const { createStripeClient } = await import("@/lib/billing/providers/stripe.server");
    return createStripeClient().request(
      "GET",
      `subscriptions/${encodeURIComponent(subscriptionId)}`,
    );
  };

  if (
    type === "checkout.session.completed" ||
    type === "checkout.session.async_payment_succeeded"
  ) {
    const checkoutId = stripeCheckoutId(object);
    const subscriptionId = str(object["subscription"]);
    if (!checkoutId || !subscriptionId) return [];
    const subscription = await fetchSubscription(subscriptionId);
    if (!mayActivateStripeCheckout(str(object["payment_status"]), str(subscription["status"])))
      return [];
    const state = stripeSubscriptionState(subscription);
    if (!state || state.ended || (state.status !== "active" && state.status !== "trialing"))
      return [];
    return [
      {
        kind: "checkout_completed",
        data: {
          checkoutId,
          subscriptionId,
          customerId: str(object["customer"]),
          status: state.status,
          periodEnd: state.periodEnd,
          cancelAtPeriodEnd: state.cancelAtPeriodEnd,
          occurredAt,
        },
      },
    ];
  }
  if (type === "invoice.payment_failed") {
    const subscriptionId = stripeInvoiceSubscriptionId(object);
    return subscriptionId ? [{ kind: "payment_failed", data: { subscriptionId, occurredAt } }] : [];
  }
  if (type === "customer.subscription.deleted") {
    const subscriptionId = str(object["id"]);
    return subscriptionId
      ? [{ kind: "subscription_ended", data: { subscriptionId, occurredAt } }]
      : [];
  }
  if (STRIPE_STATE_EVENTS.has(type)) {
    const subscriptionId =
      type === "invoice.paid" ? stripeInvoiceSubscriptionId(object) : str(object["id"]);
    if (!subscriptionId) return [];
    // The current subscription is authoritative, so it is applied as of now.
    const event = stripeStateEvent(
      subscriptionId,
      await fetchSubscription(subscriptionId),
      new Date().toISOString(),
    );
    return event ? [event] : [];
  }
  return [];
}

async function stripePaymentFor(claimed: Claimed): Promise<NormalisedPayment | null> {
  if (claimed.eventType !== "invoice.paid") return null;
  const invoice = obj(obj(claimed.payload["data"])["object"]);
  const subscriptionId = stripeInvoiceSubscriptionId(invoice);
  const invoiceId = str(invoice["id"]);
  if (!subscriptionId || !invoiceId) return null;
  const { createStripeClient } = await import("@/lib/billing/providers/stripe.server");
  const full = await createStripeClient().request(
    "GET",
    `invoices/${encodeURIComponent(invoiceId)}?expand[]=payments`,
  );
  return stripeInvoicePayment(full, subscriptionId);
}

async function applyRefund(client: Admin, provider: ProviderId, refund: NormalisedRefund) {
  return rpc<{ result: string }>(client, "billing_refund_result", {
    _provider: provider,
    _provider_refund_id: refund.providerRefundId,
    _status: refund.status,
    _failure: refund.failure,
  });
}

async function notifyPaymentFailed(): Promise<void> {
  const { sendBillingNotice } = await import("@/lib/billing/notices");
  await sendBillingNotice({
    to: null,
    subject: "LinkBooks payment failed",
    text: "A subscription payment failed. The organisation keeps access during the grace period. Existing reports stay available.",
  }).catch(() => undefined);
}
