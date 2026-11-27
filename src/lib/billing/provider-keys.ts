/** Live provider keys stay off unless this exact value is set. */
export const LIVE_PAYMENT_KEYS_FLAG = "STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS";

type Env = Record<string, string | undefined>;

export function livePaymentKeysAllowed(env: Env = process.env): boolean {
  return env[LIVE_PAYMENT_KEYS_FLAG] === "true";
}

/** Accept a Stripe test secret. A live secret needs the production flag. */
export function assertStripeTestKey(secret: string, env: Env = process.env): void {
  if (secret.startsWith("sk_test_")) return;
  if (secret.startsWith("sk_live_") && livePaymentKeysAllowed(env)) return;
  if (secret.startsWith("sk_live_")) {
    throw new Error("Stripe live keys are refused unless STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS=true.");
  }
  throw new Error("Stripe secret must start with sk_test_.");
}

/**
 * Accept a Razorpay test key id. A live key id needs the production flag.
 * When `RAZORPAY_MODE=test` (recommended for local/staging), live key ids are always refused.
 */
export function assertRazorpayTestKey(keyId: string, env: Env = process.env): void {
  const mode = (env["RAZORPAY_MODE"] ?? "").trim().toLowerCase();
  if (mode === "test" && keyId.startsWith("rzp_live_")) {
    throw new Error("RAZORPAY_MODE=test refuses live Razorpay key ids.");
  }
  if (keyId.startsWith("rzp_test_")) return;
  if (keyId.startsWith("rzp_live_") && livePaymentKeysAllowed(env)) return;
  if (keyId.startsWith("rzp_live_")) {
    throw new Error(
      "Razorpay live keys are refused unless STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS=true.",
    );
  }
  throw new Error("Razorpay key must start with rzp_test_.");
}
