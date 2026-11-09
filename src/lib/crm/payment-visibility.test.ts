import { describe, expect, it } from "vitest";
import { buildCrmDealInvoiceRow } from "@/lib/crm/payment-visibility";

describe("payment-visibility", () => {
  it("marks quoted deals without invoices as unpaid placeholders", () => {
    const row = buildCrmDealInvoiceRow({
      opportunityId: "o1",
      opportunityNumber: "OPP-1",
      opportunityName: "Deal",
      quoteId: "q1",
      quoteNumber: "Q-1",
      invoice: null,
      today: "2026-11-09",
    });
    expect(row.invoiceId).toBeNull();
    expect(row.outstandingMinor).toBe(0);
    expect(row.isOverdue).toBe(false);
  });

  it("computes outstanding and overdue from Sales invoice balances", () => {
    const row = buildCrmDealInvoiceRow({
      opportunityId: "o1",
      opportunityNumber: "OPP-1",
      opportunityName: "Deal",
      quoteId: "q1",
      invoice: {
        id: "inv1",
        invoice_number: "INV-1",
        status: "partly_paid",
        currency_code: "USD",
        total_minor: 10000,
        amount_paid_minor: 2500,
        amount_credited_minor: 0,
        due_date: "2026-11-01",
      },
      today: "2026-11-09",
    });
    expect(row.outstandingMinor).toBe(7500);
    expect(row.isOverdue).toBe(true);
    expect(row.invoiceStatus).toBe("partly_paid");
  });
});
