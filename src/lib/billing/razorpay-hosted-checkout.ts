/** Pure URL helpers — safe for modules imported by client-facing server fns. */

export function razorpayHostedCheckoutUrl(input: {
  origin: string;
  subscriptionId: string;
  checkoutId: string;
  successUrl: string;
  cancelUrl: string;
  planName: string;
  email?: string;
}): string {
  const url = new URL(`${input.origin}/api/billing/razorpay/hosted`);
  url.searchParams.set("subscription_id", input.subscriptionId);
  url.searchParams.set("checkout_id", input.checkoutId);
  url.searchParams.set("success_url", input.successUrl);
  url.searchParams.set("cancel_url", input.cancelUrl);
  url.searchParams.set("plan_name", input.planName);
  if (input.email) url.searchParams.set("email", input.email);
  return url.toString();
}

export function razorpaySubscriptionReturnUrl(origin: string): string {
  return `${origin}/settings?section=subscription&checkout=success`;
}
