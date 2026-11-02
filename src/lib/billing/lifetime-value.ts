import { platformRoleAllows, type PlatformRoleName } from "@/lib/platform/platform-roles";

export type LifetimePayment = { currency: string; amountMinor: number };

export type LifetimeValue =
  | { status: "unavailable"; minor: null; currency: null }
  | { status: "unseparated"; minor: null; currency: null }
  | { status: "stored"; minor: number; currency: string };

/** No payments is unavailable, not zero. Mixed currencies are not added together. */
export function lifetimeValueFromPayments(
  payments: readonly LifetimePayment[] | null,
): LifetimeValue {
  if (payments === null || payments.length === 0) {
    return { status: "unavailable", minor: null, currency: null };
  }
  let currency: string | null = null;
  let total = 0;
  for (const payment of payments) {
    if (!/^[A-Z]{3}$/.test(payment.currency))
      throw new Error("Currency must be a three-letter code");
    if (!Number.isInteger(payment.amountMinor) || payment.amountMinor < 0) {
      throw new Error("Lifetime value must be a whole number of minor units");
    }
    if (currency === null) currency = payment.currency;
    else if (currency !== payment.currency)
      return { status: "unseparated", minor: null, currency: null };
    total += payment.amountMinor;
  }
  return { status: "stored", minor: total, currency: currency ?? null };
}

export function recordLifetimePayment(input: {
  role: PlatformRoleName;
  currency: string;
  amountMinor: number;
  reason: string;
}): { stored: false; providerCalled: false; audit: { action: "lifetime.record"; reason: string } } {
  if (!platformRoleAllows(input.role, "billing.manage")) {
    throw new Error("Platform permission required");
  }
  lifetimeValueFromPayments([{ currency: input.currency, amountMinor: input.amountMinor }]);
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("A reason is required");
  return { stored: false, providerCalled: false, audit: { action: "lifetime.record", reason } };
}
