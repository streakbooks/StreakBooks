import { assertStripeTestKey } from "@/lib/billing/provider-keys";

export type QuoteAttachmentLine = {
  featureKey: string;
  quantity: number;
  monthlyNetMinor: number | null;
};

export type QuoteAttachmentInput = {
  companyId: string;
  planCode: string;
  currency: string;
  monthlyTotalMinor: number | null;
  lines: readonly QuoteAttachmentLine[];
};

export type QuoteAttachment =
  | { status: "unpriced"; grantsEntitlement: false }
  | { status: "blocked"; reason: string; grantsEntitlement: false }
  | {
      status: "ready";
      grantsEntitlement: false;
      companyId: string;
      planCode: string;
      currency: string;
      monthlyTotalMinor: number;
      featureKeys: string[];
    };

/** A quote becomes a provider instruction only. It does not grant a feature or write a subscription. */
export function attachQuote(
  input: QuoteAttachmentInput,
  stripeSecret: string | null,
): QuoteAttachment {
  if (
    input.monthlyTotalMinor == null ||
    input.lines.some((line) => line.quantity > 0 && line.monthlyNetMinor == null)
  ) {
    return { status: "unpriced", grantsEntitlement: false };
  }
  if (!stripeSecret) {
    return {
      status: "blocked",
      reason: "A test-mode payment secret is required before a quote can be attached.",
      grantsEntitlement: false,
    };
  }
  assertStripeTestKey(stripeSecret);
  if (!stripeSecret.startsWith("sk_test_")) {
    return {
      status: "blocked",
      reason: "A quote can be attached only with a Stripe test secret.",
      grantsEntitlement: false,
    };
  }
  return {
    status: "ready",
    grantsEntitlement: false,
    companyId: input.companyId,
    planCode: input.planCode,
    currency: input.currency,
    monthlyTotalMinor: input.monthlyTotalMinor,
    featureKeys: input.lines.filter((line) => line.quantity > 0).map((line) => line.featureKey),
  };
}
