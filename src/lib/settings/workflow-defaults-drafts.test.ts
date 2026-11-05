import { describe, expect, it } from "vitest";
import { parsePurchasesDefaultsDraft, parseSalesDefaultsDraft } from "./workflow-defaults-drafts";

const sales = {
  terms: "30",
  quoteDays: "14",
  notes: "Thank you",
  instructions: "Bank transfer",
  inclusive: true,
};

describe("sales workflow settings drafts", () => {
  it("preserves valid inputs without lossy numeric coercion", () => {
    const parsed = parseSalesDefaultsDraft(sales);
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        salesDefaultPaymentTermsDays: 30,
        salesQuoteValidityDays: 14,
        salesPricesIncludeTax: true,
      },
    });
  });

  it.each(["", " ", "-1", "1.5", "1e2", "3651", "Infinity"])(
    "rejects invalid sales payment terms: %s",
    (terms) => {
      expect(parseSalesDefaultsDraft({ ...sales, terms }).ok).toBe(false);
    },
  );

  it.each(["", "0", "366", "1.5", "3e2", "NaN"])(
    "rejects invalid quote validity: %s",
    (quoteDays) => {
      expect(parseSalesDefaultsDraft({ ...sales, quoteDays }).ok).toBe(false);
    },
  );

  it("rejects overlong invoice notes and payment instructions", () => {
    expect(parseSalesDefaultsDraft({ ...sales, notes: "x".repeat(2001) }).ok).toBe(false);
    expect(parseSalesDefaultsDraft({ ...sales, instructions: "x".repeat(2001) }).ok).toBe(false);
  });
});

describe("purchases workflow settings drafts", () => {
  const purchases = { terms: "15", notes: "Pay on receipt", requirePo: false };

  it("keeps explicit false for the purchase order preference", () => {
    expect(parsePurchasesDefaultsDraft(purchases)).toMatchObject({
      ok: true,
      value: { purchasesDefaultPaymentTermsDays: 15, purchasesRequirePo: false },
    });
  });

  it.each(["", " ", "-1", "1.5", "3651", "1e2"])(
    "rejects invalid purchase terms: %s",
    (terms) => {
      expect(parsePurchasesDefaultsDraft({ ...purchases, terms }).ok).toBe(false);
    },
  );

  it("rejects overlong purchase notes", () => {
    expect(parsePurchasesDefaultsDraft({ ...purchases, notes: "x".repeat(2001) }).ok).toBe(false);
  });
});
