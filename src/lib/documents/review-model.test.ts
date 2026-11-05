import { describe, expect, it } from "vitest";
import { canApproveDocument, validateReviewFields } from "./review-model";

const base = { status: "needs_review", documentType: "bill" };

describe("manual document review validation", () => {
  it("normalises human-entered fields without inventing accounting values", () => {
    expect(
      validateReviewFields({
        ...base,
        supplierName: "  Acme  ",
        reference: " INV-001 ",
        currencyCode: "usd",
        documentDate: "2026-11-04",
        totalMinor: 12345,
        note: "  Check amounts  ",
      }),
    ).toEqual({
      status: "needs_review",
      documentType: "bill",
      supplierName: "Acme",
      reference: "INV-001",
      currencyCode: "USD",
      documentDate: "2026-11-04",
      totalMinor: 12345,
      note: "Check amounts",
    });
  });
  it("rejects unsafe or invalid transitions metadata", () => {
    expect(() => validateReviewFields({ ...base, status: "posted" })).toThrow();
    expect(() => validateReviewFields({ ...base, documentType: "payment" })).toThrow();
    expect(() => validateReviewFields({ ...base, totalMinor: -1 })).toThrow();
    expect(() => validateReviewFields({ ...base, totalMinor: 1.5 })).toThrow();
    expect(() => validateReviewFields({ ...base, documentDate: "2026-02-30" })).toThrow();
    expect(() => validateReviewFields({ ...base, currencyCode: "USD/GBP" })).toThrow();
    expect(() => validateReviewFields({ ...base, note: "x".repeat(3001) })).toThrow();
  });
  it("requires an authorisation permission for document approval UI", () => {
    expect(canApproveDocument((p) => p === "sales.authorise")).toBe(true);
    expect(canApproveDocument(() => false)).toBe(false);
  });
});
