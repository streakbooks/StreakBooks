import { describe, expect, it } from "vitest";
import { invoiceIsOverdue, invoiceOutstandingMinor } from "./invoice-list-display";

const base = {
  status: "authorised",
  total_minor: 10000,
  amount_paid_minor: 2000,
  amount_credited_minor: 1000,
  due_date: "2026-10-10",
};

describe("invoice list presentation", () => {
  it("uses posted balances without confusing total and outstanding", () => {
    expect(invoiceOutstandingMinor(base)).toBe(7000);
    expect(invoiceOutstandingMinor({ ...base, status: "partly_paid" })).toBe(7000);
  });

  it("does not display an outstanding receivable for drafts, void or paid invoices", () => {
    for (const status of ["draft", "void", "paid"]) {
      expect(invoiceOutstandingMinor({ ...base, status })).toBe(0);
      expect(invoiceIsOverdue({ ...base, status }, "2026-11-01")).toBe(false);
    }
  });

  it("is overdue only when a positive balance is past the due date", () => {
    expect(invoiceIsOverdue(base, "2026-11-01")).toBe(true);
    expect(invoiceIsOverdue(base, "2026-10-10")).toBe(false);
    expect(invoiceIsOverdue(base, "")).toBe(false);
    expect(
      invoiceIsOverdue(
        { ...base, amount_paid_minor: 10000, amount_credited_minor: 0 },
        "2026-11-01",
      ),
    ).toBe(false);
  });

  it("keeps overpayments negative rather than inventing a receivable", () => {
    expect(
      invoiceOutstandingMinor({ ...base, amount_paid_minor: 10500, amount_credited_minor: 0 }),
    ).toBe(-500);
  });
});
