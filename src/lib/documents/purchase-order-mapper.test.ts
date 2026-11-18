import { describe, expect, it } from "vitest";
import { mapPurchaseOrder } from "./mappers";

describe("supplier purchase-order documents", () => {
  it("carries approved commercial terms and delivery instructions into print and email data", () => {
    const doc = mapPurchaseOrder(
      {
        id: "po",
        order_number: "PO-1",
        order_date: "2026-11-18",
        status: "sent",
        currency_code: "USD",
        supplier_reference: "SUP-42",
        expected_delivery_date: "2026-12-01",
        acknowledged_on: "2026-11-19",
        delivery_address: "12 Harbour Road",
        terms: "Net 30; deliver weekdays",
        memo: "Contact reception",
        subtotal_minor: 1000,
        tax_minor: 0,
        total_minor: 1000,
      },
      [
        {
          description: "Chairs",
          quantity: 1,
          unit_price_minor: 1000,
          net_minor: 1000,
          tax_minor: 0,
          tax_rate_bps: 0,
        },
      ],
      { name: "Acme" },
      { baseCurrency: "GBP", companyTaxNumber: null },
    );
    expect(doc.currency).toBe("USD");
    expect(doc.reference).toBe("SUP-42");
    expect(doc.notes).toContain("Contact reception");
    expect(doc.notes).toContain("Delivery address:\n12 Harbour Road");
    expect(doc.paymentTermsText).toBe("Net 30; deliver weekdays");
    expect(doc.extraMeta).toContainEqual({ label: "Expected delivery", value: "2026-12-01" });
    expect(doc.totals.dueMinor).toBeNull();
  });
});
