import { describe, expect, it } from "vitest";
import {
  exclusiveTax,
  inclusiveTax,
  proportionalTax,
  providerAddsTax,
  type CheckoutTax,
} from "./tax";

// The same vectors are asserted against the database in tests/integration/billing-tax-invoicing.sql.
describe("tax arithmetic", () => {
  it("splits tax out of an inclusive price", () => {
    expect(inclusiveTax(99900n, 1800)).toBe(15239n);
    expect(inclusiveTax(100n, 0)).toBe(0n);
    expect(inclusiveTax(1n, 1800)).toBe(0n);
  });

  it("adds tax to an exclusive price", () => {
    expect(exclusiveTax(1000n, 1800)).toBe(180n);
    expect(exclusiveTax(2000n, 2000)).toBe(400n);
  });

  it("credits tax in proportion", () => {
    expect(proportionalTax(50000n, 15239n, 99900n)).toBe(7627n);
    expect(() => proportionalTax(1n, 0n, 0n)).toThrow();
  });

  it("rejects impossible rates", () => {
    expect(() => inclusiveTax(100n, -1)).toThrow();
    expect(() => exclusiveTax(100n, 10001)).toThrow();
  });

  it("knows when the provider must add tax", () => {
    const base: CheckoutTax = {
      ruleId: "r",
      label: "VAT",
      rateBps: 2000,
      mode: "exclusive",
      treatment: "standard",
      taxMinor: 400,
      note: null,
    };
    expect(providerAddsTax(base)).toBe(true);
    expect(providerAddsTax({ ...base, mode: "inclusive" })).toBe(false);
    expect(providerAddsTax({ ...base, treatment: "reverse_charge", rateBps: 0 })).toBe(false);
    expect(providerAddsTax(null)).toBe(false);
  });
});
