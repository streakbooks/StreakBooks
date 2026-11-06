import { describe, expect, it } from "vitest";
import {
  fillBlankReviewFields, isOcrDocument, minorUnits, parseAzureInvoiceSuggestions, OCR_MAX_FILE_BYTES,
} from "./ocr-model";

describe("Files OCR suggestion mapping", () => {
  it("supports only PDF/JPEG/PNG, refusing other images and office formats", () => {
    expect(isOcrDocument("application/pdf", "invoice.PDF")).toBe(true);
    expect(isOcrDocument("image/jpeg", "receipt.jpeg")).toBe(true);
    expect(isOcrDocument("image/png", "receipt.PNG")).toBe(true);
    expect(isOcrDocument("image/svg+xml", "script.svg")).toBe(false);
    expect(isOcrDocument("application/pdf", "script.html")).toBe(false);
    expect(isOcrDocument("application/msword", "doc.doc")).toBe(false);
    expect(OCR_MAX_FILE_BYTES).toBe(8 * 1024 * 1024);
  });

  it("maps named invoice fields into suggestions, never approval or posting", () => {
    const result = parseAzureInvoiceSuggestions({
      status: "succeeded",
      analyzeResult: {
        documents: [{
          fields: {
            InvoiceId: { valueString: "INV-102", confidence: 0.96 },
            VendorName: { valueString: "Harbor Supply", confidence: 0.82 },
            InvoiceDate: { valueDate: "2026-11-05", confidence: 0.94 },
            InvoiceTotal: {
              valueCurrency: { amount: 135.25, currencyCode: "USD" }, confidence: 0.87,
            },
          },
        }],
      },
    });
    expect(result.suggestions).toEqual({
      documentType: "bill",
      reference: "INV-102",
      supplierName: "Harbor Supply",
      documentDate: "2026-11-05",
      currencyCode: "USD",
      totalMinor: 13525,
    });
    expect(result.confidence.reference).toBeCloseTo(0.96);
    expect(Object.keys(result.suggestions)).not.toContain("status");
    expect(result.warnings).toEqual([]);
  });

  it("uses ISO minor units, leaves unknown or invalid totals unfilled", () => {
    expect(minorUnits(200, "JPY")).toBe(200);
    expect(minorUnits(1.234, "KWD")).toBe(1234);
    expect(minorUnits(12.34, "INR")).toBe(1234);
    expect(minorUnits(12.34, "ABC")).toBeNull();
    expect(minorUnits(1.234, "USD")).toBeNull();
    expect(minorUnits(-1, "USD")).toBeNull();
    expect(minorUnits(99999999999999, "USD")).toBeNull();
  });

  it("never overwrites existing values, review status or a valid zero amount", () => {
    const original = {
      status: "ready" as const,
      documentType: "receipt" as const,
      reference: "MANUAL-01",
      supplierName: "Already checked",
      documentDate: "2026-11-01",
      currencyCode: "INR",
      totalMinor: 0,
      note: "Reviewed by staff",
    };
    const merged = fillBlankReviewFields(original, {
      documentType: "bill",
      reference: "OCR-WRONG",
      supplierName: "OCR-WRONG",
      documentDate: "2026-11-05",
      currencyCode: "USD",
      totalMinor: 99999,
    });
    expect(merged).toEqual(original);
    expect(merged.status).toBe("ready");
    const blanks = fillBlankReviewFields({
      status: "needs_review", documentType: "unclassified",
      reference: null, supplierName: null, documentDate: null,
      currencyCode: null, totalMinor: null, note: "Preserve me",
    }, {
      documentType: "bill", reference: "BILL-17", totalMinor: 12345,
    });
    expect(blanks).toMatchObject({
      status: "needs_review", documentType: "bill",
      reference: "BILL-17", totalMinor: 12345, note: "Preserve me",
    });
  });

  it("does not accept truncated dates or currency codes", () => {
    const result = parseAzureInvoiceSuggestions({
      status: "succeeded",
      analyzeResult: {
        documents: [{
          fields: {
            InvoiceDate: { valueDate: "2026-11-061" },
            InvoiceTotal: { valueCurrency: { amount: 10, currencyCode: "USDX" } },
          },
        }],
      },
    });
    expect(result.suggestions.documentDate).toBeUndefined();
    expect(result.suggestions.currencyCode).toBeUndefined();
    expect(result.suggestions.totalMinor).toBeUndefined();
  });

  it("rejects malformed date and no structured document", () => {
    const result = parseAzureInvoiceSuggestions({
      status: "succeeded",
      analyzeResult: {
        documents: [{
          fields: {
            InvoiceDate: { valueDate: "2026-02-30" },
            InvoiceTotal: { valueCurrency: { amount: 10, currencyCode: "ABC" } },
          },
        }],
      },
    });
    expect(result.suggestions.documentDate).toBeUndefined();
    expect(result.suggestions.totalMinor).toBeUndefined();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(() => parseAzureInvoiceSuggestions({ status: "running" })).toThrow(
      "No structured",
    );
  });

  it("bounds text and confidence without HTML or control character injection", () => {
    const result = parseAzureInvoiceSuggestions({
      status: "succeeded",
      analyzeResult: {
        documents: [{
          fields: {
            VendorName: { valueString: "X\u202e".repeat(200), confidence: 3 },
            InvoiceId: { valueString: "R".repeat(300), confidence: -1 },
          },
        }],
      },
    });
    expect(result.suggestions.reference?.length).toBe(120);
    expect(result.suggestions.supplierName).not.toContain("\u202e");
    expect(result.confidence.supplierName).toBe(1);
    expect(result.confidence.reference).toBe(0);
  });
});
