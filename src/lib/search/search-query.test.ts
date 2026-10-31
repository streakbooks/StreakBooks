import { describe, expect, it } from "vitest";
import { minorAmountCandidates, searchDate, searchOrFilter } from "./search-query";

describe("global search amount queries", () => {
  it("finds exact 0, 2 and 3 decimal currency values", () => {
    expect(minorAmountCandidates("1250")).toEqual([1250, 125000, 1250000]);
    expect(minorAmountCandidates("1,250.50")).toEqual([125050, 1250500]);
    expect(minorAmountCandidates("₹1,25,000.00")).toEqual([12500000, 125000000]);
    expect(minorAmountCandidates("KWD 2.125")).toEqual([2125]);
  });
  it("preserves signs and never rounds an invalid value", () => {
    expect(minorAmountCandidates("-$100.25")).toEqual([-10025, -100250]);
    expect(minorAmountCandidates("20.001")).toEqual([20001]);
    expect(minorAmountCandidates("12.1234")).toEqual([]);
    expect(minorAmountCandidates("INV-100")).toEqual([]);
    expect(minorAmountCandidates("1,23")).toEqual([]);
  });
  it("refuses unsafe values rather than overflowing", () => {
    expect(minorAmountCandidates("99999999999999999999999")).toEqual([]);
  });
  it("adds signed amount predicates for bank transactions", () => {
    const filter = searchOrFilter(["description", "payee"], "100.50", { amountField: "amount_minor", bankAmount: true });
    expect(filter).toContain("amount_minor.eq.10050");
    expect(filter).toContain("amount_minor.eq.-10050");
    expect(filter).toContain("description.ilike.");
    expect(searchOrFilter(["description"], "-100.50", { amountField: "amount_minor", bankAmount: true })).not.toContain("amount_minor.eq.10050");
  });
  it("includes valid dates but rejects impossible calendar dates", () => {
    expect(searchDate("2026-10-31")).toBe("2026-10-31");
    expect(searchDate("2026-02-30")).toBeNull();
    expect(searchOrFilter(["memo"], "2026-10-31", { dateFields: ["invoice_date"] })).toContain("invoice_date.eq.2026-10-31");
  });
  it("sanitises the user input before constructing OR expressions", () => {
    const s = searchOrFilter(["invoice_number", "memo"], 'x),company_id.eq.foo');
    expect(s).not.toContain("company_id.eq.foo");
    expect(s).toContain("invoice_number.ilike.");
  });
});
