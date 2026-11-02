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
  const currency = payments[0]!.currency;
  let total = 0;
  for (const payment of payments) {
    if (!/^[A-Z]{3}$/.test(payment.currency))
      throw new Error("Currency must be a three-letter code");
    if (!Number.isSafeInteger(payment.amountMinor) || payment.amountMinor < 0) {
      throw new Error("Lifetime value must be a whole number of minor units");
    }
    if (currency !== payment.currency)
      return { status: "unseparated", minor: null, currency: null };
    total += payment.amountMinor;
    if (!Number.isSafeInteger(total))
      throw new Error("Lifetime value exceeds safe minor-unit precision");
  }
  return { status: "stored", minor: total, currency };
}

export function recordLifetimePayment(input: {
  role: PlatformRoleName;
  currency: string;
  amountMinor: number;
  reason: string;
  sourceId?: string;
  recordedSourceIds?: readonly string[];
}): { stored: false; providerCalled: false; audit: { action: "lifetime.record"; reason: string } } {
  if (!platformRoleAllows(input.role, "billing.manage")) {
    throw new Error("Platform permission required");
  }
  lifetimeValueFromPayments([{ currency: input.currency, amountMinor: input.amountMinor }]);
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("A reason is required");
  const sourceId = input.sourceId?.trim() ?? "";
  if (input.sourceId !== undefined && sourceId.length < 1) throw new Error("Name the payment");
  if (sourceId.length > 0 && (input.recordedSourceIds ?? []).includes(sourceId)) {
    throw new Error("That payment is already recorded");
  }
  return { stored: false, providerCalled: false, audit: { action: "lifetime.record", reason } };
}
