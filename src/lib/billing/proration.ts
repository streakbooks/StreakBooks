import { assertStripeTestKey } from "@/lib/billing/provider-keys";

/** Integer minor units for the days left in the period. Truncates toward zero. */
export function prorateMinor(
  amountMinor: number,
  daysRemaining: number,
  daysInPeriod: number,
): number {
  if (!Number.isInteger(amountMinor)) throw new Error("Proration amount must be an integer.");
  if (
    !Number.isInteger(daysRemaining) ||
    !Number.isInteger(daysInPeriod) ||
    daysInPeriod < 1 ||
    daysRemaining < 0 ||
    daysRemaining > daysInPeriod
  ) {
    throw new Error("Proration days are outside the billing period.");
  }
  return Math.trunc((amountMinor * daysRemaining) / daysInPeriod);
}

export type MidCycleChange = {
  status: "blocked" | "ready";
  reason: string | null;
  prorationMinor: number;
  providerCalled: false;
};

/** Add or remove a priced feature for the days left. No provider call is made here. */
export function midCycleFeatureChange(input: {
  previousMinor: number;
  nextMinor: number;
  daysRemaining: number;
  daysInPeriod: number;
  stripeSecret: string | null;
}): MidCycleChange {
  const prorationMinor = prorateMinor(
    input.nextMinor - input.previousMinor,
    input.daysRemaining,
    input.daysInPeriod,
  );
  if (!input.stripeSecret) {
    return {
      status: "blocked",
      reason: "A test-mode payment secret is required before a mid-cycle change.",
      prorationMinor,
      providerCalled: false,
    };
  }
  assertStripeTestKey(input.stripeSecret);
  if (!input.stripeSecret.startsWith("sk_test_")) {
    return {
      status: "blocked",
      reason: "Mid-cycle proration can be sent only with a Stripe test secret.",
      prorationMinor,
      providerCalled: false,
    };
  }
  return { status: "ready", reason: null, prorationMinor, providerCalled: false };
}
