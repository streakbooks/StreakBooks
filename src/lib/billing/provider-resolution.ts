/**
 * Central country → payment-provider resolution for StreakBooks hybrid billing.
 *
 * Authority: `billing.country_providers(country)` via `billing.payment_provider_routes`
 * (seeded India → Razorpay, default → Stripe). Server checkout and plan changes must not
 * trust a client-supplied provider. Existing subscriptions stay locked to
 * `company_subscriptions.provider` — never silently migrate.
 */
import {
  paymentMethodsFor,
  type PayMethodChoice,
  type PaymentProviderAvailability,
} from "@/lib/billing/checkout-payload";

export type BillingProviderId = "stripe" | "razorpay";

/** Seed defaults matching `billing.payment_provider_routes` — only used when DB routes are unavailable. */
export function defaultRoutedProviders(country: string): BillingProviderId[] {
  return country.trim().toUpperCase() === "IN" ? ["razorpay"] : ["stripe"];
}

export function normaliseRoutedProviders(
  providers: readonly string[] | null | undefined,
  country: string,
): BillingProviderId[] {
  const allowed = (providers ?? [])
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is BillingProviderId => item === "stripe" || item === "razorpay");
  if (allowed.length > 0) return [...new Set(allowed)];
  return defaultRoutedProviders(country);
}

/** Prefer the first configured routed provider that has server keys. */
export function preferredCheckoutProvider(
  routed: readonly BillingProviderId[],
  env: PaymentProviderAvailability,
): BillingProviderId | null {
  for (const provider of routed) {
    if (provider === "stripe" && env.stripe) return "stripe";
    if (provider === "razorpay" && env.razorpay) return "razorpay";
  }
  return null;
}

export function assertProviderRouted(
  provider: BillingProviderId,
  routed: readonly BillingProviderId[],
): void {
  if (!routed.includes(provider)) {
    throw new Error("That payment method is not offered in your country.");
  }
}

/**
 * Payment methods for checkout: env keys ∩ country routes.
 * Frontend must pass `routedProviders` from the server price list / checkout price.
 */
export function paymentMethodsForRoutedCountry(
  country: string,
  env: PaymentProviderAvailability,
  routedProviders: readonly BillingProviderId[] | null | undefined,
): PayMethodChoice[] {
  const routed = normaliseRoutedProviders(routedProviders, country);
  return paymentMethodsFor(country, env).filter((method) => routed.includes(method.provider));
}

export function lockedSubscriptionProvider(
  provider: string | null | undefined,
): BillingProviderId | null {
  if (provider === "stripe" || provider === "razorpay") return provider;
  return null;
}
