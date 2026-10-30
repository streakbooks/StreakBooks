import { describe, expect, it } from "vitest";
import { assertCheckoutRegion, resolveBillingRegion } from "@/lib/billing/region";

describe("automatic subscription billing region", () => {
  it("selects the configured regional currency from server geolocation", () => {
    expect(resolveBillingRegion({ visitorCountry: " in " })).toEqual({
      country: "IN", currency: "INR", source: "visitor",
    });
    expect(resolveBillingRegion({ visitorCountry: "GB" }).currency).toBe("GBP");
    expect(resolveBillingRegion({ visitorCountry: "AU" }).currency).toBe("AUD");
    expect(resolveBillingRegion({ visitorCountry: "NZ" }).currency).toBe("NZD");
    expect(resolveBillingRegion({ visitorCountry: "CA" }).currency).toBe("USD");
  });

  it("pins returning organisations to their own country while users travel", () => {
    expect(resolveBillingRegion({ organisationCountry: "US", visitorCountry: "IN" })).toEqual({
      country: "US", currency: "USD", source: "organisation",
    });
  });

  it("does not fabricate a currency or country when geolocation is missing", () => {
    expect(resolveBillingRegion({ visitorCountry: "ZZ" })).toEqual({
      country: "US", currency: "USD", source: "fallback",
    });
    expect(resolveBillingRegion({})).toEqual({
      country: "US", currency: "USD", source: "fallback",
    });
    expect(resolveBillingRegion({ visitorCountry: "FR" })).toEqual({
      country: "FR", currency: "USD", source: "visitor",
    });
  });

  it("rejects a forged or stale country when starting a payment", () => {
    expect(() => assertCheckoutRegion("IN", "US")).toThrow(/billing region has changed/i);
    expect(() => assertCheckoutRegion("us", "US")).not.toThrow();
  });
}
