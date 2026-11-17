import { describe, expect, it } from "vitest";
import { buildPosCatalogueQuote, parsePosQuote, type PosCatalogueItem } from "./catalogue-quote";
const companyId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const product: PosCatalogueItem = {
  id: productId,
  company_id: companyId,
  name: "Consultation",
  code: "CONS",
  unit: "hour",
  is_active: true,
  sales_price_minor: 10000,
  sales_tax_rate_bps: 1000,
};
const input = { companyId, lines: [{ productId, quantity: 1 }] };
const quote = (
  overrides: Partial<PosCatalogueItem> = {},
  quantity = 1,
  treatment: "inclusive" | "exclusive" = "exclusive",
) =>
  buildPosCatalogueQuote(
    { ...input, lines: [{ productId, quantity }] },
    [{ ...product, ...overrides }],
    "USD",
    treatment,
  );
describe("POS catalogue preview", () => {
  it("uses server catalogue values and line-rounded Sales tax math", () => {
    expect(quote()).toMatchObject({
      netMinor: "10000",
      taxMinor: "1000",
      grossMinor: "11000",
      status: "preview",
    });
    expect(quote({ sales_price_minor: 333 }, 1.5)).toMatchObject({
      netMinor: "500",
      taxMinor: "50",
      grossMinor: "550",
    });
  });
  it("extracts tax from inclusive prices", () => {
    expect(quote({ sales_price_minor: 11000 }, 1, "inclusive")).toMatchObject({
      netMinor: "10000",
      taxMinor: "1000",
      grossMinor: "11000",
    });
  });
  it.each(["USD", "GBP", "AUD", "NZD", "CAD", "INR", "JPY", "KWD"])(
    "keeps minor units exact for %s",
    (currency) => {
      expect(buildPosCatalogueQuote(input, [product], currency, "exclusive").currency).toBe(
        currency,
      );
    },
  );
  it("serializes totals beyond the JavaScript safe integer range exactly", () => {
    const result = quote({ sales_price_minor: Number.MAX_SAFE_INTEGER, sales_tax_rate_bps: 0 }, 2);
    expect(result.grossMinor).toBe("18014398509481982");
    expect(() => JSON.stringify(result)).not.toThrow();
  });
  it("keeps duplicate cart lines separate and adds their rounded amounts", () => {
    expect(
      buildPosCatalogueQuote(
        { companyId, lines: [...input.lines, ...input.lines] },
        [product],
        "USD",
        "exclusive",
      ).grossMinor,
    ).toBe("22000");
  });
  it.each([0, -1, NaN, Infinity, 0.0000001, 1.0000001, Number.MAX_SAFE_INTEGER, "1"])(
    "rejects invalid quantity %s",
    (quantity) => {
      expect(() =>
        parsePosQuote({ ...input, lines: [{ productId, quantity: quantity as number }] }),
      ).toThrow(/Quantity/);
    },
  );
  it("accepts six-place fractional quantities", () =>
    expect(quote({}, 0.000001).grossMinor).toBe("0"));
  it("fails closed for inactive, missing and foreign-company products", () => {
    expect(() => quote({ is_active: false })).toThrow(/unavailable/);
    expect(() => quote({ company_id: productId })).toThrow(/unavailable/);
    expect(() => buildPosCatalogueQuote(input, [], "USD", "exclusive")).toThrow(/unavailable/);
  });
  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects unsafe catalogue price %s",
    (sales_price_minor) => {
      expect(() => quote({ sales_price_minor })).toThrow(/safely/);
    },
  );
  it.each([-1, 10001, 1.5])("rejects invalid catalogue tax %s", (sales_tax_rate_bps) => {
    expect(() => quote({ sales_tax_rate_bps })).toThrow(/Tax rate/);
  });
  it("rejects malformed IDs and cart size", () => {
    expect(() => parsePosQuote({ ...input, companyId: "bad" })).toThrow();
    expect(() => parsePosQuote({ companyId, lines: [] })).toThrow();
    expect(() => parsePosQuote({ companyId, lines: Array(101).fill(input.lines[0]) })).toThrow();
    expect(() =>
      parsePosQuote({ companyId, lines: [{ productId: "bad", quantity: 1 }] }),
    ).toThrow();
  });
  it("strips client prices and tax from the validated input", () => {
    const result = parsePosQuote({
      companyId,
      lines: [{ productId, quantity: 1, unitPriceMinor: 1, taxRateBps: 0 }],
    } as typeof input);
    expect(result).toEqual(input);
  });
  it("rejects absent currency and unknown tax treatment", () => {
    expect(() => buildPosCatalogueQuote(input, [product], "", "exclusive")).toThrow(/currency/);
    expect(() => buildPosCatalogueQuote(input, [product], "USD", "bad" as "exclusive")).toThrow(
      /treatment/,
    );
  });
});
