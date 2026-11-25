import { createHmac, timingSafeEqual } from "node:crypto";
import {
  createRazorpayClient,
  createRazorpayPlan,
  type RazorpayClient,
} from "@/lib/billing/providers/razorpay.server";

type Admin = {
  rpc: (
    fn: never,
    args?: never,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
};

type Purchase = {
  id: string;
  service_code: string;
  plan_code: string;
  cadence: "month" | "session";
  amount_minor: number;
  currency: string;
  razorpay_plan_id: string | null;
  razorpay_subscription_id: string | null;
  razorpay_order_id: string | null;
};

type CheckoutProduct = {
  purchaseId: string;
  serviceCode: string;
  serviceName: string;
  planCode: string;
  planName: string;
  amountMinor: number;
  currency: string;
  cadence: "month" | "session";
  razorpayPlanId: string | null;
};

const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers });
}

export function createAdvisorsRazorpayClient(): RazorpayClient {
  const keyId = process.env["ADVISORS_RAZORPAY_KEY_ID"];
  const keySecret = process.env["ADVISORS_RAZORPAY_KEY_SECRET"];
  if (!keyId || !keySecret) {
    throw new Error(
      "Configure ADVISORS_RAZORPAY_KEY_ID and ADVISORS_RAZORPAY_KEY_SECRET for the Link Business Advisory merchant account.",
    );
  }
  return createRazorpayClient({
    ...process.env,
    RAZORPAY_KEY_ID: keyId,
    RAZORPAY_KEY_SECRET: keySecret,
    STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS: process.env["ADVISORS_ALLOW_LIVE_PAYMENT_KEYS"],
  });
}

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

async function rpc<T>(client: Admin, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(name as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

async function body(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function validId(value: unknown, prefix: "order" | "pay" | "sub"): value is string {
  return typeof value === "string" && new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value);
}

function signedHexMatches(expected: string, received: unknown): boolean {
  if (typeof received !== "string" || !/^[a-f\d]{64}$/i.test(received)) return false;
  const expectedBytes = Buffer.from(expected, "hex");
  const receivedBytes = Buffer.from(received, "hex");
  return (
    expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
  );
}

function signature(value: string): string {
  const secret = process.env["ADVISORS_RAZORPAY_KEY_SECRET"];
  if (!secret) throw new Error("Razorpay server credentials are not configured.");
  return createHmac("sha256", secret).update(value).digest("hex");
}

async function createCheckout(request: Request): Promise<Response> {
  const input = await body(request);
  const serviceCode = input?.["serviceCode"];
  const planCode = input?.["planCode"];
  const buyerName = input?.["buyerName"];
  const buyerEmail = input?.["buyerEmail"];
  const buyerPhone = input?.["buyerPhone"];
  if (
    (serviceCode !== "bookkeeping" && serviceCode !== "coaching") ||
    typeof planCode !== "string" ||
    typeof buyerName !== "string" ||
    buyerName.trim().length < 1 ||
    buyerName.trim().length > 120 ||
    typeof buyerEmail !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail) ||
    buyerEmail.length > 254 ||
    typeof buyerPhone !== "string" ||
    buyerPhone.trim().length < 7 ||
    buyerPhone.trim().length > 32
  ) {
    return json(400, { error: "Enter a valid service, plan and contact details." });
  }

  try {
    const client = await admin();
    const product = await rpc<CheckoutProduct>(client, "advisors_public_checkout_create", {
      _service_code: serviceCode,
      _plan_code: planCode,
      _buyer_name: buyerName.trim(),
      _buyer_email: buyerEmail.trim().toLowerCase(),
      _buyer_phone: buyerPhone.trim(),
    });
    if (!product?.purchaseId || product.amountMinor < 100 || !/^[A-Z]{3}$/.test(product.currency)) {
      return json(400, { error: "This Advisors plan is not available for online checkout." });
    }

    const razorpay = createAdvisorsRazorpayClient();
    if (product.cadence === "month") {
      let planId = product.razorpayPlanId;
      if (!planId) {
        const plan = await createRazorpayPlan(razorpay, {
          planPriceId: product.planCode,
          planName: product.planName,
          currency: product.currency,
          amountMinor: product.amountMinor,
          interval: "month",
        });
        planId = plan.priceId;
      }
      const subscription = await razorpay.request("POST", "subscriptions", {
        plan_id: planId,
        total_count: 120,
        customer_notify: true,
        notes: {
          advisors_purchase_id: product.purchaseId,
          purpose: "advisors_service_subscription",
        },
      });
      const subscriptionId = subscription["id"];
      if (!validId(subscriptionId, "sub"))
        throw new Error("Razorpay did not return a subscription.");
      await rpc(client, "advisors_public_checkout_attach", {
        _purchase_id: product.purchaseId,
        _razorpay_plan_id: planId,
        _razorpay_subscription_id: subscriptionId,
        _razorpay_order_id: null,
      });
      return json(200, {
        key_id: process.env["ADVISORS_RAZORPAY_KEY_ID"],
        purchase_id: product.purchaseId,
        subscription_id: subscriptionId,
        amount: product.amountMinor,
        currency: product.currency,
        cadence: product.cadence,
        name: product.serviceName,
        description: product.planName,
        buyer_name: buyerName.trim(),
        buyer_email: buyerEmail.trim(),
        buyer_phone: buyerPhone.trim(),
      });
    }

    const order = await razorpay.request("POST", "orders", {
      amount: product.amountMinor,
      currency: product.currency,
      receipt: `adv-${product.purchaseId.replaceAll("-", "").slice(0, 24)}`,
      notes: {
        advisors_purchase_id: product.purchaseId,
        purpose: "advisors_service_purchase",
      },
    });
    const orderId = order["id"];
    if (!validId(orderId, "order")) throw new Error("Razorpay did not return an order.");
    await rpc(client, "advisors_public_checkout_attach", {
      _purchase_id: product.purchaseId,
      _razorpay_plan_id: null,
      _razorpay_subscription_id: null,
      _razorpay_order_id: orderId,
    });
    return json(200, {
      key_id: process.env["ADVISORS_RAZORPAY_KEY_ID"],
      purchase_id: product.purchaseId,
      order_id: orderId,
      amount: product.amountMinor,
      currency: product.currency,
      cadence: product.cadence,
      name: product.serviceName,
      description: product.planName,
      buyer_name: buyerName.trim(),
      buyer_email: buyerEmail.trim(),
      buyer_phone: buyerPhone.trim(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checkout could not be created.";
    const status = /401|unauthori[sz]ed|authentication/i.test(message) ? 401 : 500;
    console.error("Advisors Razorpay checkout creation failed", message);
    return json(status, {
      error:
        status === 401
          ? "Razorpay rejected the server credentials. Check the configured test or live key pair."
          : "Could not start Advisors checkout. Please try again or contact support.",
    });
  }
}

async function verifyCheckout(request: Request): Promise<Response> {
  const input = await body(request);
  const purchaseId = input?.["purchase_id"];
  const paymentId = input?.["razorpay_payment_id"];
  const orderId = input?.["razorpay_order_id"];
  const subscriptionId = input?.["razorpay_subscription_id"];
  const receivedSignature = input?.["razorpay_signature"];
  if (
    typeof purchaseId !== "string" ||
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(purchaseId) ||
    !validId(paymentId, "pay") ||
    typeof receivedSignature !== "string"
  ) {
    return json(400, { error: "Payment details are incomplete." });
  }

  try {
    const client = await admin();
    const purchase = await rpc<Purchase | null>(client, "advisors_public_checkout_get", {
      _purchase_id: purchaseId,
    });
    if (!purchase) return json(400, { error: "This Advisors checkout could not be found." });
    const razorpay = createAdvisorsRazorpayClient();

    if (purchase.cadence === "month") {
      if (!validId(subscriptionId, "sub") || subscriptionId !== purchase.razorpay_subscription_id) {
        return json(400, { error: "This payment does not match the Advisors subscription." });
      }
      if (!signedHexMatches(signature(`${paymentId}|${subscriptionId}`), receivedSignature)) {
        return json(400, { error: "Payment signature verification failed." });
      }
      const subscription = await razorpay.request(
        "GET",
        `subscriptions/${encodeURIComponent(subscriptionId)}`,
      );
      const notes = subscription["notes"] as Record<string, unknown> | undefined;
      const status = subscription["status"];
      if (
        notes?.["advisors_purchase_id"] !== purchase.id ||
        notes?.["purpose"] !== "advisors_service_subscription" ||
        subscription["plan_id"] !== purchase.razorpay_plan_id ||
        (status !== "authenticated" && status !== "active")
      ) {
        return json(400, { error: "Razorpay could not confirm this Advisors subscription." });
      }
      const payment = await razorpay.request("GET", `payments/${encodeURIComponent(paymentId)}`);
      if (
        payment["subscription_id"] !== subscriptionId ||
        payment["amount"] !== purchase.amount_minor ||
        payment["currency"] !== purchase.currency ||
        (payment["status"] !== "authorized" && payment["status"] !== "captured")
      ) {
        return json(400, { error: "Razorpay could not confirm the subscription payment." });
      }
    } else {
      if (!validId(orderId, "order") || orderId !== purchase.razorpay_order_id) {
        return json(400, { error: "This payment does not match the Advisors order." });
      }
      if (!signedHexMatches(signature(`${orderId}|${paymentId}`), receivedSignature)) {
        return json(400, { error: "Payment signature verification failed." });
      }
      const order = await razorpay.request("GET", `orders/${encodeURIComponent(orderId)}`);
      const notes = order["notes"] as Record<string, unknown> | undefined;
      if (
        notes?.["advisors_purchase_id"] !== purchase.id ||
        notes?.["purpose"] !== "advisors_service_purchase" ||
        order["amount"] !== purchase.amount_minor ||
        order["currency"] !== purchase.currency ||
        order["status"] !== "paid"
      ) {
        return json(400, { error: "Razorpay could not confirm this Advisors payment." });
      }
      const payment = await razorpay.request("GET", `payments/${encodeURIComponent(paymentId)}`);
      if (
        payment["order_id"] !== orderId ||
        payment["amount"] !== purchase.amount_minor ||
        payment["currency"] !== purchase.currency ||
        payment["status"] !== "captured"
      ) {
        return json(400, { error: "Razorpay has not captured this payment." });
      }
    }

    const result = await rpc<{ purchaseId: string; status: string }>(
      client,
      "advisors_public_checkout_verify",
      { _purchase_id: purchase.id, _payment_id: paymentId },
    );
    return json(200, { verified: true, purchase_id: result.purchaseId, status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment could not be verified.";
    console.error("Advisors Razorpay payment verification failed", message);
    return json(500, { error: "Could not verify this payment. Please contact Advisors support." });
  }
}

export async function handleAdvisorsRazorpayCheckout(
  request: Request,
  pathname: "/api/advisors/create-checkout" | "/api/advisors/verify-payment",
): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  return pathname === "/api/advisors/create-checkout"
    ? createCheckout(request)
    : verifyCheckout(request);
}
