import {
  assertRazorpayTestKey,
  assertStripeTestKey,
  livePaymentKeysAllowed,
} from "@/lib/billing/provider-keys";
import { resolvePortalCheckoutMode, type PortalCheckoutMode } from "@/lib/portals/payment-rules";

export function portalCheckoutMode(): {
  mode: PortalCheckoutMode;
  livemode: boolean;
  allowSandbox: boolean;
} {
  return {
    ...resolvePortalCheckoutMode({
      stripeSecretKey: process.env["STRIPE_SECRET_KEY"],
      razorpayKeyId: process.env["RAZORPAY_KEY_ID"],
      razorpayKeySecret: process.env["RAZORPAY_KEY_SECRET"],
      allowSandbox: false,
      allowLiveKeys: livePaymentKeysAllowed(),
    }),
    allowSandbox: false,
  };
}

export function checkoutModeFor(allowSandbox: boolean): {
  mode: PortalCheckoutMode;
  livemode: boolean;
} {
  return resolvePortalCheckoutMode({
    stripeSecretKey: process.env["STRIPE_SECRET_KEY"],
    razorpayKeyId: process.env["RAZORPAY_KEY_ID"],
    razorpayKeySecret: process.env["RAZORPAY_KEY_SECRET"],
    allowSandbox,
    allowLiveKeys: livePaymentKeysAllowed(),
  });
}

type CheckoutInput = {
  origin: string;
  intentId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  amountMinor: number;
  currency: string;
  companyName: string;
};

export async function createProviderCheckout(
  mode: "stripe" | "razorpay" | "sandbox",
  input: CheckoutInput,
): Promise<{
  provider: "stripe" | "razorpay" | "linkbooks_sandbox";
  sessionId: string;
  url: string;
}> {
  if (mode === "sandbox") {
    return {
      provider: "linkbooks_sandbox",
      sessionId: `sandbox:${input.intentId}`,
      url: `${input.origin}/portal/pay/${input.intentId}`,
    };
  }
  if (mode === "stripe") {
    const secret = process.env["STRIPE_SECRET_KEY"] ?? "";
    assertStripeTestKey(secret);
    const body = new URLSearchParams();
    body.set("mode", "payment");
    body.set("success_url", `${input.origin}/portal/app/payments?paid=1`);
    body.set("cancel_url", `${input.origin}/portal/app/invoices/${input.invoiceId}`);
    body.set("client_reference_id", input.intentId);
    body.set("metadata[purpose]", "portal_invoice");
    body.set("metadata[intent_id]", input.intentId);
    body.set("line_items[0][quantity]", "1");
    body.set("line_items[0][price_data][currency]", input.currency.toLowerCase());
    body.set("line_items[0][price_data][unit_amount]", String(input.amountMinor));
    body.set(
      "line_items[0][price_data][product_data][name]",
      `${input.companyName} invoice ${input.invoiceNumber ?? ""}`.slice(0, 120),
    );
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const json = (await response.json()) as {
      id?: string;
      url?: string;
      error?: { message?: string };
    };
    if (!response.ok || !json.id || !json.url) {
      throw new Error(json.error?.message || "Stripe did not open a checkout session.");
    }
    return { provider: "stripe", sessionId: json.id, url: json.url };
  }

  const keyId = process.env["RAZORPAY_KEY_ID"] ?? "";
  const keySecret = process.env["RAZORPAY_KEY_SECRET"] ?? "";
  assertRazorpayTestKey(keyId);
  const response = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: input.amountMinor,
      currency: input.currency,
      description: `${input.companyName} invoice ${input.invoiceNumber ?? ""}`.slice(0, 120),
      callback_url: `${input.origin}/portal/app/payments`,
      callback_method: "get",
      notes: { purpose: "portal_invoice", intent_id: input.intentId },
    }),
  });
  const json = (await response.json()) as {
    id?: string;
    short_url?: string;
    error?: { description?: string };
  };
  if (!response.ok || !json.id || !json.short_url) {
    throw new Error(json.error?.description || "Razorpay did not open a payment link.");
  }
  return { provider: "razorpay", sessionId: json.id, url: json.short_url };
}

type PortalJson = null | boolean | number | string | PortalJson[] | { [key: string]: PortalJson };

export async function settlePortalPayment(payload: Record<string, unknown>): Promise<PortalJson> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (
    supabaseAdmin as unknown as {
      rpc: (
        name: string,
        args: { payload: Record<string, unknown> },
      ) => Promise<{
        data: unknown;
        error: { message?: string } | null;
      }>;
    }
  ).rpc("settle_portal_payment", { payload });
  if (error) throw new Error(error.message || "Payment could not be settled");
  if (data === null || data === undefined) return {};
  return data as PortalJson;
}
