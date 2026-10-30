import { createHmac, timingSafeEqual } from "node:crypto";

const STRIPE_TOLERANCE_SECONDS = 300;

export function stripeSignatureHeader(
  payload: string,
  secret: string,
  timestampSeconds: number,
): string {
  const digest = createHmac("sha256", secret)
    .update(`${timestampSeconds}.${payload}`)
    .digest("hex");
  return `t=${timestampSeconds},v1=${digest}`;
}

/** Stripe-Signature: t=unix,v1=hex of HMAC-SHA256(`${t}.${rawBody}`). */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowSeconds: number,
): void {
  if (!secret) throw new Error("Stripe webhook secret is not configured.");
  if (!header) throw new Error("Missing Stripe signature.");
  const parts = new Map(
    header.split(",").map((piece) => {
      const index = piece.indexOf("=");
      return [piece.slice(0, index), piece.slice(index + 1)] as const;
    }),
  );
  const timestamp = Number(parts.get("t"));
  const signature = parts.get("v1");
  if (!Number.isFinite(timestamp) || !signature) throw new Error("Stripe signature is malformed.");
  if (Math.abs(nowSeconds - timestamp) > STRIPE_TOLERANCE_SECONDS) {
    throw new Error("Stripe signature is outside the allowed time window.");
  }
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  if (!safeEqualHex(expected, signature)) throw new Error("Stripe signature does not match.");
}

export function razorpaySignatureHex(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyRazorpaySignature(
  payload: string,
  header: string | null,
  secret: string,
): void {
  if (!secret) throw new Error("Razorpay webhook secret is not configured.");
  if (!header) throw new Error("Missing Razorpay signature.");
  const expected = razorpaySignatureHex(payload, secret);
  if (!safeEqualHex(expected, header.trim())) throw new Error("Razorpay signature does not match.");
}

function safeEqualHex(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
