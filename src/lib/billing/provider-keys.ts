/** Refuse live payment keys. Checkout stays in provider test mode. */
export function assertStripeTestKey(secret: string): void {
  if (!secret.startsWith("sk_test_")) {
    throw new Error("Stripe live keys are refused. Use a test secret that starts with sk_test_.");
  }
}

export function assertRazorpayTestKey(keyId: string): void {
  if (!keyId.startsWith("rzp_test_")) {
    throw new Error("Razorpay live keys are refused. Use a test key that starts with rzp_test_.");
  }
}
