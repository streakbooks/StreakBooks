import { verifyRazorpaySignature, verifyStripeSignature } from "@/lib/billing/signatures";
import { parseRazorpayPortalEvent, parseStripePortalEvent } from "@/lib/portals/webhook-events";
import { settlePortalPayment } from "@/lib/portals/portal-payments.server";

export async function handlePortalWebhook(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const raw = await request.text();
  try {
    if (url.pathname === "/api/portals/stripe") {
      const secret =
        process.env["PORTAL_STRIPE_WEBHOOK_SECRET"] || process.env["STRIPE_WEBHOOK_SECRET"] || "";
      verifyStripeSignature(
        raw,
        request.headers.get("stripe-signature"),
        secret,
        Math.floor(Date.now() / 1000),
      );
      const event = parseStripePortalEvent(raw);
      if (!event) return Response.json({ received: true, ignored: true });
      await settlePortalPayment({
        provider: event.provider,
        provider_event_id: event.providerEventId,
        event_type: event.eventType,
        intent_id: event.intentId,
        provider_payment_id: event.providerPaymentId,
        amount_minor: event.amountMinor,
        currency: event.currency,
        fee_minor: event.feeMinor,
      });
    } else if (url.pathname === "/api/portals/razorpay") {
      const secret =
        process.env["PORTAL_RAZORPAY_WEBHOOK_SECRET"] ||
        process.env["RAZORPAY_WEBHOOK_SECRET"] ||
        "";
      verifyRazorpaySignature(raw, request.headers.get("x-razorpay-signature"), secret);
      const event = parseRazorpayPortalEvent(raw, request.headers.get("x-razorpay-event-id"));
      if (!event) return Response.json({ received: true, ignored: true });
      await settlePortalPayment({
        provider: event.provider,
        provider_event_id: event.providerEventId,
        event_type: event.eventType,
        intent_id: event.intentId,
        provider_payment_id: event.providerPaymentId,
        amount_minor: event.amountMinor,
        currency: event.currency,
        fee_minor: event.feeMinor,
      });
    } else {
      return new Response("Not found", { status: 404 });
    }
    return Response.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook failed";
    const status = /signature|configured|malformed|time window|does not match/i.test(message)
      ? 400
      : 500;
    return Response.json({ error: message }, { status });
  }
}
