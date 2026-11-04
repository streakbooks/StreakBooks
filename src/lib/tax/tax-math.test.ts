import { describe, expect, it } from "vitest";
import { computeTaxLine, isRateEffective } from "./tax-math";

describe("computeTaxLine exclusive", () => {
  it("applies half-up tax on net", () => {
    const r = computeTaxLine({
      quantity: 1,
      unit_price_minor: 1000,
      tax_rate_bps: 2000,
      treatment: "exclusive",
    });
    expect(r.net_minor).toBe(1000n);
    expect(r.tax_minor).toBe(200n);
    expect(r.gross_minor).toBe(1200n);
  });

  it("subtracts discount before tax", () => {
    const r = computeTaxLine({
      quantity: 2,
      unit_price_minor: 1000,
      discount_minor: 100,
      tax_rate_bps: 1000,
      treatment: "exclusive",
    });
    expect(r.net_minor).toBe(1900n);
    expect(r.tax_minor).toBe(190n);
  });
});

describe("computeTaxLine inclusive", () => {
  it("extracts tax from gross with half-up net", () => {
    const r = computeTaxLine({
      quantity: 1,
      unit_price_minor: 1200,
      tax_rate_bps: 2000,
      treatment: "inclusive",
    });
    expect(r.gross_minor).toBe(1200n);
    expect(r.net_minor).toBe(1000n);
    expect(r.tax_minor).toBe(200n);
  });

  it("zero rate keeps whole as net", () => {
    const r = computeTaxLine({
      quantity: 1,
      unit_price_minor: 500,
      tax_rate_bps: 0,
      treatment: "inclusive",
    });
    expect(r).toEqual({ net_minor: 500n, tax_minor: 0n, gross_minor: 500n });
  });
});

describe("isRateEffective", () => {
  it("respects active window", () => {
    const rate = {
      effective_from: "2024-01-01",
      effective_to: "2024-12-31",
      is_active: true,
    };
    expect(isRateEffective(rate, "2024-06-01")).toBe(true);
    expect(isRateEffective(rate, "2023-12-31")).toBe(false);
    expect(isRateEffective(rate, "2025-01-01")).toBe(false);
    expect(isRateEffective({ ...rate, is_active: false }, "2024-06-01")).toBe(false);
  });
});

describe("tax calculation input integrity", () => {
  const line = {
    quantity: 1,
    unit_price_minor: 10000n,
    tax_rate_bps: 2000,
    treatment: "exclusive" as const,
  };

  it.each([Number.MAX_SAFE_INTEGER + 1, 1.25, Infinity, NaN])(
    "does not silently coerce unsafe monetary inputs",
    (unit) => {
      expect(() => computeTaxLine({ ...line, unit_price_minor: unit })).toThrow(
        /safe integer minor units/,
      );
      expect(() => computeTaxLine({ ...line, discount_minor: unit })).toThrow(
        /safe integer minor units/,
      );
    },
  );

  it.each([0, -1, NaN, Infinity, 0.0000001, 1.1234567])(
    "refuses invalid quantities or unrepresentable decimal precision",
    (quantity) => {
      expect(() => computeTaxLine({ ...line, quantity })).toThrow(/Quantity/);
    },
  );

  it("accepts six-place quantities and conventional floating representation noise", () => {
    const a = computeTaxLine({ ...line, quantity: 1.234567 });
    expect(a.net_minor).toBe(12345n);
    const b = computeTaxLine({ ...line, quantity: 0.1 + 0.2 });
    expect(b.net_minor).toBe(3000n);
  });

  it("rejects unsupported runtime tax treatments instead of assuming inclusive", () => {
    expect(() => computeTaxLine({ ...line, treatment: "unknown" as never })).toThrow(
      /Unknown tax treatment/,
    );
  });

  it("retains exact bigint arithmetic beyond the safe number range", () => {
    const large = 9007199254740993n;
    const result = computeTaxLine({ ...line, unit_price_minor: large });
    expect(result.net_minor).toBe(large);
    expect(result.tax_minor).toBe((large * 2000n + 5000n) / 10000n);
    expect(result.gross_minor).toBe(result.net_minor + result.tax_minor);
  });

  it("does not accept unsafe quantity multiplication at any tax rate", () => {
    expect(() => computeTaxLine({ ...line, quantity: Number.MAX_SAFE_INTEGER })).toThrow(
      /Quantity/,
    );
  });
});
