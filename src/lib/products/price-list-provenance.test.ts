import { describe, expect, it } from "vitest";
import {
  appliedPriceListSnapshot,
  verifiedLinePricing,
  withManualPricing,
} from "./price-list-provenance";
import { emptySalesLine } from "@/lib/sales/line-form-state";

describe("sales draft pricing provenance", () => {
  const input = {
    priceListId: "list",
    productId: "product",
    currency: "USD",
    quantity: "10",
    documentDate: "2026-11-06",
    cataloguePriceMinor: 2000,
    fixedPrices: { product: 1700 },
    tiers: [{
      id: "tier", product_id: "product", min_quantity: "10",
      effective_from: "2026-01-01", effective_to: null, unit_price_minor: 1500,
    }],
    discounts: [{
      id: "percent", product_id: "product", min_quantity: "1",
      effective_from: "2026-01-01", effective_to: null, discount_bps: 2000,
    }],
  };
  it("records chosen tier, percentage and exact post-discount unit price", () => {
    expect(appliedPriceListSnapshot(input)).toEqual({
      source: "price_list", price_list_id: "list", product_id: "product",
      currency_code: "USD", unit_price_minor: 1200, quantity: "10",
      pricing_date: "2026-11-06", basis: "tier", discount_bps: 2000,
    });
  });
  it("distinguishes fixed, catalogue and no-list pricing", () => {
    expect(appliedPriceListSnapshot({ ...input, tiers: [] })?.basis).toBe("fixed");
    expect(appliedPriceListSnapshot({ ...input, fixedPrices: {}, tiers: [] })?.basis)
      .toBe("catalogue");
    expect(appliedPriceListSnapshot({ ...input, priceListId: "" })).toBeNull();
    expect(appliedPriceListSnapshot({ ...input, documentDate: "" })).toBeNull();
  });
  it("invalidates trace on manual quantity, price or product edits only", () => {
    const trace = appliedPriceListSnapshot(input)!;
    const line = { ...emptySalesLine(), pricingTrace: trace };
    for (const patch of [
      { quantity: "11" }, { unitPrice: "10.50" }, { productId: "another" },
    ]) {
      expect(withManualPricing(line, patch).pricingTrace).toBeNull();
    }
    expect(withManualPricing(line, { description: "Updated notes" }).pricingTrace)
      .toEqual(trace);
  });
  it("refuses to save stale amount, currency, product or selected-list attribution", () => {
    const trace = appliedPriceListSnapshot(input)!;
    const common = {
      trace, selectedPriceListId: "list", productId: "product",
      quantity: "10.00", unitPrice: "12.00", currency: "USD",
    };
    expect(verifiedLinePricing(common)).toEqual(trace);
    expect(verifiedLinePricing({ ...common, unitPrice: "12.01" })).toBeNull();
    expect(verifiedLinePricing({ ...common, currency: "EUR" })).toBeNull();
    expect(verifiedLinePricing({ ...common, selectedPriceListId: null })).toBeNull();
    expect(verifiedLinePricing({ ...common, productId: "other" })).toBeNull();
    expect(verifiedLinePricing({ ...common, quantity: "12" })).toBeNull();
  });
  it("preserves exact zero-price list attribution", () => {
    const trace = appliedPriceListSnapshot({
      ...input, tiers: [], fixedPrices: { product: 0 }, discounts: [],
    });
    expect(trace?.unit_price_minor).toBe(0);
    expect(verifiedLinePricing({
      trace, selectedPriceListId: "list", productId: "product", quantity: "10",
      unitPrice: "0.00", currency: "USD",
    })).toEqual(trace);
  });
});
