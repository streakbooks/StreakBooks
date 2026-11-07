import { describe, expect, it } from "vitest";
import {
  DEFAULT_MARKETPLACE_APPS,
  filterMarketplaceApps,
  normalizeMarketplaceApps,
} from "@/lib/app-store/catalogue";
import { isConnectorE2EVerified } from "@/lib/app-store/connector-status";
import {
  isInstallableNativeConnector,
  nativePriorityRoadmap,
} from "@/lib/app-store/adapters/registry";

describe("marketplace catalogue", () => {
  it("seeds native Amazon, Shopify and Stripe as priorities without E2E claims", () => {
    const codes = DEFAULT_MARKETPLACE_APPS.map((a) => a.code);
    expect(codes).toContain("shopify");
    expect(codes).toContain("amazon_seller");
    expect(codes).toContain("stripe_payments");
    for (const app of DEFAULT_MARKETPLACE_APPS) {
      expect(isConnectorE2EVerified(app.implementationStatus)).toBe(false);
    }
  });

  it("lists Hubdoc and Link My Books as partner_api integrations", () => {
    const hubdoc = DEFAULT_MARKETPLACE_APPS.find((a) => a.code === "hubdoc");
    const lmb = DEFAULT_MARKETPLACE_APPS.find((a) => a.code === "link_my_books");
    expect(hubdoc?.kind).toBe("partner_api");
    expect(lmb?.kind).toBe("partner_api");
    expect(hubdoc?.requestedApiScopes.length).toBeGreaterThan(0);
    expect(lmb?.requestedApiScopes.length).toBeGreaterThan(0);
  });

  it("filters by category, country and kind", () => {
    const ecommerce = filterMarketplaceApps(DEFAULT_MARKETPLACE_APPS, {
      category: "ecommerce",
    });
    expect(ecommerce.every((a) => a.categoryCodes.includes("ecommerce"))).toBe(true);
    const partners = filterMarketplaceApps(DEFAULT_MARKETPLACE_APPS, {
      kind: "partner_api",
    });
    expect(partners.every((a) => a.kind === "partner_api")).toBe(true);
    const us = filterMarketplaceApps(DEFAULT_MARKETPLACE_APPS, { country: "US" });
    expect(us.every((a) => a.countries.includes("US"))).toBe(true);
  });

  it("normalizes empty payloads to defaults", () => {
    expect(normalizeMarketplaceApps([])).toEqual([...DEFAULT_MARKETPLACE_APPS]);
  });

  it("keeps native installs blocked until E2E verification", () => {
    expect(isInstallableNativeConnector("shopify")).toBe(false);
    expect(isInstallableNativeConnector("amazon_seller")).toBe(false);
    expect(isInstallableNativeConnector("stripe_payments")).toBe(false);
    expect(nativePriorityRoadmap().every((r) => r.e2eVerified === false)).toBe(true);
  });
});
