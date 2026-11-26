import { describe, expect, it } from "vitest";
import { salesDocumentEndDate } from "./document-defaults";

describe("Sales document date defaults", () => {
  it("uses organisation payment terms for a new invoice without customer terms", () => {
    expect(
      salesDocumentEndDate({
        kind: "invoice",
        documentDate: "2026-11-01",
        defaultPaymentTermsDays: 45,
      }),
    ).toBe("2026-12-16");
  });

  it("keeps customer payment terms ahead of the organisation default", () => {
    expect(
      salesDocumentEndDate({
        kind: "invoice",
        documentDate: "2026-11-01",
        customerPaymentTermsDays: 14,
        defaultPaymentTermsDays: 45,
      }),
    ).toBe("2026-11-15");
  });

  it("uses configured quote validity from the quote date", () => {
    expect(
      salesDocumentEndDate({
        kind: "quote",
        documentDate: "2026-11-01",
        quoteValidityDays: 60,
      }),
    ).toBe("2026-12-31");
  });

  it("retains the 30-day fallback and does not add end dates to credit notes", () => {
    expect(salesDocumentEndDate({ kind: "invoice", documentDate: "2026-11-01" })).toBe(
      "2026-12-01",
    );
    expect(
      salesDocumentEndDate({ kind: "credit_note", documentDate: "2026-11-01" }),
    ).toBeUndefined();
  });
});
