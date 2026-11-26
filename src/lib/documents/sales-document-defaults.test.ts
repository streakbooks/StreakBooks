import { describe, expect, it } from "vitest";
import { salesPaymentInstructionsForDocument } from "@/lib/documents/sales-document-defaults";

describe("sales payment instructions defaults", () => {
  it("uses the saved Sales instructions when document branding is blank", () => {
    expect(salesPaymentInstructionsForDocument("sales_invoice", null, "Pay by bank transfer")).toBe(
      "Pay by bank transfer",
    );
  });

  it("keeps explicit document branding ahead of the Sales default", () => {
    expect(
      salesPaymentInstructionsForDocument(
        "sales_quote",
        "Use the reference shown on this quote",
        "Pay by bank transfer",
      ),
    ).toBe("Use the reference shown on this quote");
  });

  it("does not put Sales payment instructions on purchase documents", () => {
    expect(
      salesPaymentInstructionsForDocument("purchase_bill", null, "Pay by bank transfer"),
    ).toBeNull();
    expect(
      salesPaymentInstructionsForDocument("purchase_bill", "Supplier payment reference", ""),
    ).toBe("Supplier payment reference");
  });
});
