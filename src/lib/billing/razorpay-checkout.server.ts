import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createRazorpayClient } from "@/lib/billing/providers/razorpay.server";

type CheckoutPath = "/api/create-order" | "/api/verify-payment";

type AuthenticatedOperator = {
  userId: string;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: jsonHeaders });
}

async function authenticateOperator(request: Request): Promise<AuthenticatedOperator | Response> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!url || !key || !token) return json(401, { error: "Sign in with platform billing access." });

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") {
    return json(401, { error: "Your session is invalid. Sign in again." });
  }

  const { data: role, error: roleError } = await supabase.rpc("platform_role");
  if (roleError || (role !== "platform_owner" && role !== "platform_finance")) {
    return json(403, { error: "Platform billing access is required." });
  }
  return { userId };
}

function isResponse(value: AuthenticatedOperator | Response): value is Response {
  return value instanceof Response;
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function constantTimeHexEqual(expected: string, actual: string): boolean {
  if (!/^[a-f\d]{64}$/i.test(actual)) return false;
  const expectedBytes = Buffer.from(expected, "hex");
  const actualBytes = Buffer.from(actual, "hex");
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

export async function handleRazorpayCheckout(
  request: Request,
  pathname: CheckoutPath,
): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  const operator = await authenticateOperator(request);
  if (isResponse(operator)) return operator;

  if (pathname === "/api/create-order") {
    const body = await readJson(request);
    const amount = body?.["amount"];
    const currency = body?.["currency"];
    if (
      !Number.isSafeInteger(amount) ||
      (amount as number) < 100 ||
      typeof currency !== "string" ||
      !/^[A-Z]{3}$/.test(currency)
    ) {
      return json(400, {
        error: "Enter an amount of at least 100 minor units and a valid currency.",
      });
    }

    try {
      const razorpay = createRazorpayClient();
      const order = await razorpay.request("POST", "orders", {
        amount: amount as number,
        currency,
        receipt: `sb-${crypto.randomUUID()}`,
        notes: { purpose: "standard_checkout_test", operator_id: operator.userId },
      });
      if (typeof order["id"] !== "string") {
        return json(502, { error: "Razorpay did not return an order." });
      }
      return json(200, {
        order_id: order["id"],
        amount: order["amount"],
        currency: order["currency"],
        key_id: process.env["RAZORPAY_KEY_ID"],
      });
    } catch (error) {
      console.error(
        "Razorpay order creation failed",
        error instanceof Error ? error.message : error,
      );
      return json(500, { error: "Razorpay could not create the order. Check server credentials." });
    }
  }

  const body = await readJson(request);
  const orderId = body?.["razorpay_order_id"];
  const paymentId = body?.["razorpay_payment_id"];
  const signature = body?.["razorpay_signature"];
  if (
    typeof orderId !== "string" ||
    typeof paymentId !== "string" ||
    typeof signature !== "string" ||
    !/^order_[A-Za-z0-9]+$/.test(orderId) ||
    !/^pay_[A-Za-z0-9]+$/.test(paymentId)
  ) {
    return json(400, { error: "Payment ID, order ID and signature are required." });
  }

  const secret = process.env["RAZORPAY_KEY_SECRET"];
  if (!secret) return json(500, { error: "Razorpay server credentials are not configured." });
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  if (!constantTimeHexEqual(expected, signature)) {
    return json(400, { error: "Payment signature verification failed." });
  }

  try {
    const order = await createRazorpayClient().request(
      "GET",
      `orders/${encodeURIComponent(orderId)}`,
    );
    const notes = order["notes"] as Record<string, unknown> | undefined;
    if (
      notes?.["operator_id"] !== operator.userId ||
      notes?.["purpose"] !== "standard_checkout_test"
    ) {
      return json(400, { error: "This order does not belong to your checkout session." });
    }
  } catch (error) {
    console.error(
      "Razorpay order verification lookup failed",
      error instanceof Error ? error.message : error,
    );
    return json(500, { error: "Razorpay could not confirm this order." });
  }

  return json(200, { verified: true, message: "Payment signature verified." });
}
