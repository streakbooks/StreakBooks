import { describe, expect, it } from "vitest";
import {
  parseMoneySearch, minorAmountForCurrency, documentMoneyFilter,
  bankMoneyFilter, searchDate, searchOrFilter,
} from "./search-query";

describe("exact global search monetary matching", () => {
  const query = parseMoneySearch("50.00")!;
  it("treats the complete amount as money rather than a fuzzy string", () => {
    expect(query).toEqual({ decimal: "50.00", sign: "both" });
    expect(parseMoneySearch("INV-0050")).toBeNull();
    expect(parseMoneySearch("2026-10-31")).toBeNull();
    expect(parseMoneySearch("50.00abc")).toBeNull();
    expect(parseMoneySearch("50%")).toBeNull();
    expect(parseMoneySearch("1,23")).toBeNull();
  });
  it("uses the actual stored currency precision, without a 500.00 false positive", () => {
    expect(minorAmountForCurrency(query, "GBP")).toBe(5000);
    expect(minorAmountForCurrency(query, "USD")).toBe(5000);
    expect(minorAmountForCurrency(query, "INR")).toBe(5000);
    expect(minorAmountForCurrency(query, "JPY")).toBe(50);
    expect(minorAmountForCurrency(query, "KWD")).toBe(50000);
    expect(minorAmountForCurrency(query, "GBP")).not.toBe(50000);
    expect(minorAmountForCurrency(parseMoneySearch("500.00")!, "GBP")).toBe(50000);
  });
  it("searches currency and total_minor atomically in document queries", () => {
    const f = documentMoneyFilter(query);
    expect(f).toContain("and(currency_code.not.in.(JPY,KWD),total_minor.eq.5000)");
    expect(f).toContain("and(currency_code.eq.JPY,total_minor.eq.50)");
    expect(f).toContain("and(currency_code.eq.KWD,total_minor.eq.50000)");
    expect(f).not.toContain("and(currency_code.eq.GBP,total_minor.eq.50000)");
    expect(documentMoneyFilter(parseMoneySearch("GBP 50.00")!))
      .toBe("and(currency_code.eq.GBP,total_minor.eq.5000)");
  });
  it("matches a bank transaction only within accounts holding the right currency", () => {
    const f = bankMoneyFilter(query, [
      { id: "gbp-bank", currency_code: "GBP" },
      { id: "jpy-bank", currency_code: "JPY" },
      { id: "kwd-bank", currency_code: "KWD" },
      { id: "usd-bank", currency_code: "USD" },
    ]);
    expect(f).toContain("bank_account_id.in.(gbp-bank,usd-bank),amount_minor.in.(5000,-5000)");
    expect(f).toContain("bank_account_id.in.(jpy-bank),amount_minor.in.(50,-50)");
    expect(f).toContain("bank_account_id.in.(kwd-bank),amount_minor.in.(50000,-50000)");
    expect(f).not.toContain("bank_account_id.in.(gbp-bank),amount_minor.in.(50000");
  });
  it("respects a negative sign and explicit currency", () => {
    expect(bankMoneyFilter(parseMoneySearch("-£50.00")!, [
      { id: "gbp-bank", currency_code: "GBP" },
      { id: "usd-bank", currency_code: "USD" },
    ])).toBe("and(bank_account_id.in.(gbp-bank),amount_minor.in.(-5000))");
    expect(documentMoneyFilter(parseMoneySearch("-GBP 50.00")!))
      .toBe("and(currency_code.eq.GBP,total_minor.eq.-5000)");
    expect(minorAmountForCurrency(parseMoneySearch("GBP 50.00")!, "USD")).toBeNull();
    expect(parseMoneySearch("USD £50.00")).toBeNull();
    expect(parseMoneySearch("GBP -50.00")!.sign).toBe("negative");
  });
  it("keeps fractional accuracy and declines unsupported precision", () => {
    expect(minorAmountForCurrency(parseMoneySearch("50.001")!, "GBP")).toBeNull();
    expect(minorAmountForCurrency(parseMoneySearch("50.001")!, "KWD")).toBe(50001);
    expect(minorAmountForCurrency(parseMoneySearch("50.000")!, "GBP")).toBe(5000);
    expect(minorAmountForCurrency(parseMoneySearch("₹1,25,000.00")!, "INR")).toBe(12500000);
    expect(minorAmountForCurrency(parseMoneySearch("999999999999999999999")!, "GBP")).toBeNull();
  });
  it("retains exact date search and safe text filtering", () => {
    expect(searchDate("2026-10-31")).toBe("2026-10-31");
    expect(searchDate("2026-02-30")).toBeNull();
    expect(searchOrFilter(["memo"], "2026-10-31", { dateFields: ["invoice_date"] }))
      .toContain("invoice_date.eq.2026-10-31");
    const f = searchOrFilter(["invoice_number"], "x),company_id.eq.foo");
    expect(f).not.toContain("company_id.eq.foo");
    expect(f).toContain("invoice_number.ilike.");
    expect(searchOrFilter(["description"], "50.00")).not.toContain("amount_minor");
  });
});
