import { isBillingCountry } from "@/lib/billing/billing-countries";
import { checkoutCurrencyForCountry } from "@/lib/billing/checkout-payload";

/**
 * Resolve subscription billing location independently from accounting currency.
 * Company country wins over transient IP data (travel/VPN). Server geolocation
 * is an initial hint, never proof of legal tax residency.
 */
export function resolveBillingRegion(input: {
  visitorCountry?: string | null | undefined;
  organisationCountry?: string | null | undefined;
}) {
  const organisation = normaliseCountry(input.organisationCountry);
  const visitor = normaliseCountry(input.visitorCountry);
  const country = organisation ?? visitor ?? "US";
  return {
    country,
    currency: checkoutCurrencyForCountry(country),
    source: organisation ? ("organisation" as const) : visitor ? ("visitor" as const) : ("fallback" as const),
  };
}

function normaliseCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  return isBillingCountry(code) ? code : null;
}

/** Prevent a client-supplied country from changing the agreed subscription price. */
export function assertCheckoutRegion(providedCountry: string, expectedCountry: string): void {
  if (providedCountry.trim().toUpperCase() !== expectedCountry) {
    throw new Error(
      "Your billing region has changed. Reopen subscription checkout to confirm the displayed price. " +
        "If your organisation country is incorrect, update the organisation settings.",
    );
  }
}
