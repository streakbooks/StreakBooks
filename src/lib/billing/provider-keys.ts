/** Accept Stripe and Razorpay test or live secrets. Reject anything else. */
export function assertStripeTestKey(secret: string): void {
  if (!secret.startsWith("sk_test_") && !secret.startsWith("sk_live_")) {
    throw new Error("Stripe secret must start with sk_test_ or sk_live_.");
  }
}

export function assertRazorpayTestKey(keyId: string): void {
  if (!keyId.startsWith("rzp_test_") && !keyId.startsWith("rzp_live_")) {
    throw new Error("Razorpay key must start with rzp_test_ or rzp_live_.");
  }
}
