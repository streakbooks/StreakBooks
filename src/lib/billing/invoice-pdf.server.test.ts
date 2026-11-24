import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { renderBillingDocumentPdf, type BillingDocument } from "./invoice-pdf.server";

const invoice: BillingDocument = {
  kind: "invoice",
  number: "TS/IN/000001",
  invoiceNumber: "TS/IN/000001",
  issuedAt: "2026-11-05T00:00:00.000Z",
  seller: {
    legalName: "Synthetic Seller India",
    line1: "1 Example Road",
    city: "Mumbai",
    country: "IN",
    registrations: [{ scheme: "GSTIN", number: "27ABCDE1234F1Z5" }],
  },
  customer: {
    name: "Customer Pvt Ltd",
    country: "IN",
    taxIdScheme: "GSTIN",
    taxId: "29ABCDE1234F1Z5",
  },
  currency: "INR",
  tax: { label: "GST", rateBps: 1800, mode: "inclusive", treatment: "standard", note: null },
  subtotalMinor: 84661,
  taxMinor: 15239,
  totalMinor: 99900,
  periodStart: "2026-11-05T00:00:00.000Z",
  periodEnd: "2026-12-05T00:00:00.000Z",
  lines: [
    {
      description: "StreakBooks Pro subscription",
      quantity: 1,
      netMinor: 84661,
      taxMinor: 15239,
      totalMinor: 99900,
    },
  ],
};

describe("billing document PDF", () => {
  it("renders an invoice with the rupee sign and its number in the title", async () => {
    const bytes = await renderBillingDocumentPdf(invoice);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
    expect(loaded.getTitle()).toBe("Tax invoice TS/IN/000001");
  });

  it("renders a credit note", async () => {
    const bytes = await renderBillingDocumentPdf({
      ...invoice,
      kind: "credit_note",
      number: "TC/IN/000001",
      reason: "Goodwill",
      tax: { ...invoice.tax, note: "Synthetic configured note" },
    });
    expect((await PDFDocument.load(bytes)).getTitle()).toBe("Credit note TC/IN/000001");
  });
});
