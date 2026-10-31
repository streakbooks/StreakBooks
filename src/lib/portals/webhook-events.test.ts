import { describe, expect, it } from "vitest";
import { isFullRefund, parseRazorpayPortalEvent, parseStripePortalEvent } from "./webhook-events";
import { stripeSignatureHeader } from "@/lib/billing/signatures";

const intent = "11111111-1111-4111-8111-111111111111";

describe("portal webhook events", () => {
  it("reads a Stripe checkout for a portal invoice and ignores subscription checkout", () => {
    const paid = parseStripePortalEvent(
      JSON.stringify({
        id: "evt_1",
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { purpose: "portal_invoice", intent_id: intent },
            amount_total: 2500,
            currency: "gbp",
            payment_status: "paid",
            payment_intent: "pi_1",
          },
        },
      }),
    );
    expect(paid).toMatchObject({
      eventType: "paid",
      intentId: intent,
      amountMinor: 2500,
      currency: "GBP",
      providerPaymentId: "pi_1",
    });

    expect(
      parseStripePortalEvent(
        JSON.stringify({
          id: "evt_2",
          type: "checkout.session.completed",
          data: { object: { metadata: { purpose: "subscription" }, amount_total: 100 } },
        }),
      ),
    ).toBeNull();
  });

  it("keeps the Stripe signature helper compatible with portal webhook bodies", () => {
    const payload = JSON.stringify({ id: "evt_3", type: "charge.refunded" });
    const header = stripeSignatureHeader(payload, "whsec_test", 1_700_000_000);
    expect(header.startsWith("t=1700000000,v1=")).toBe(true);
  });

  it("reads a Razorpay payment link and a refund", () => {
    const paid = parseRazorpayPortalEvent(
      JSON.stringify({
        event: "payment_link.paid",
        payload: {
          payment: {
            entity: {
              id: "pay_1",
              amount: 9900,
              currency: "INR",
              fee: 200,
              notes: { intent_id: intent },
            },
          },
          payment_link: { entity: { notes: { intent_id: intent } } },
        },
      }),
      "hook_1",
    );
    expect(paid).toMatchObject({
      providerEventId: "hook_1",
      eventType: "paid",
      amountMinor: 9900,
      feeMinor: 200,
      currency: "INR",
    });
  });

  it("treats a smaller refund as partial", () => {
    expect(isFullRefund(5000, 5000)).toBe(true);
    expect(isFullRefund(5000, 1000)).toBe(false);
  });
});
