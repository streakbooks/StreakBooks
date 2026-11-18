import { describe, expect, it } from "vitest";
import {
  FILE_CATEGORIES,
  FILE_CATEGORY_LABELS,
  parseFileCategory,
  suggestExistingTags,
  suggestFileCategory,
  validateDocumentTagName,
} from "./file-classification";

describe("Files categories, smart hints and tags", () => {
  it("accepts only fixed categories, preventing arbitrary storage values", () => {
    expect(parseFileCategory("bill")).toBe("bill");
    expect(parseFileCategory("tax")).toBe("tax");
    expect(parseFileCategory("random-db-column")).toBe("unclassified");
    expect(FILE_CATEGORIES).toHaveLength(10);
    expect(FILE_CATEGORY_LABELS.invoice).toBe("Sales invoice");
  });

  it("prioritises linked record classification over contradictory filenames", () => {
    const hint = suggestFileCategory("receipt-458.pdf", "purchase_bill");
    expect(hint).toMatchObject({
      category: "bill",
      source: "linked_record",
    });
    expect(suggestFileCategory("draft.pdf", "sales_invoice")?.category).toBe("invoice");
  });

  it("suggests tax, bank, payroll, receipts and contracts from exact keywords", () => {
    expect(suggestFileCategory("October_Payroll.xlsx", "company")?.category).toBe("payroll");
    expect(suggestFileCategory("Tax-Invoice-Dec.pdf", "company")?.category).toBe("tax");
    expect(suggestFileCategory("Bank_Statement_Nov.pdf", "company")?.category).toBe("bank");
    expect(suggestFileCategory("rent-lease.pdf", "company")?.category).toBe("contract");
    expect(suggestFileCategory("paid receipt.JPG", "company")?.category).toBe("receipt");
    expect(suggestFileCategory("supplier_invoice_9.pdf", "company")?.category).toBe("bill");
    expect(suggestFileCategory("sales-invoice_9.pdf", "company")?.category).toBe("invoice");
    expect(suggestFileCategory("random-number-3.pdf", "company")).toBeNull();
  });

  it("does not suggest a category from embedded non-word fragments", () => {
    expect(suggestFileCategory("salaryman.jpg", "company")).toBeNull();
    expect(suggestFileCategory("transcription.pdf", "company")).toBeNull();
  });

  it("requires safe, bounded company tag names", () => {
    expect(validateDocumentTagName("  FY2026   Closing ")).toBe("FY2026 Closing");
    expect(validateDocumentTagName("GST")).toBe("GST");
    expect(() => validateDocumentTagName("")).toThrow("1–50");
    expect(() => validateDocumentTagName("x".repeat(51))).toThrow("1–50");
    expect(() => validateDocumentTagName("<script>")).toThrow("1–50");
    expect(() => validateDocumentTagName("abc\u202e")).toThrow("1–50");
    expect(() => validateDocumentTagName(4)).toThrow("must be text");
  });

  it("proposes only existing tags with exact token/phrase matches", () => {
    const tags = [
      { id: "one", name: "GST" },
      { id: "two", name: "2026" },
      { id: "three", name: "Lease" },
      { id: "four", name: "Paid invoice" },
      { id: "five", name: "a" },
    ];
    expect(suggestExistingTags("gst_paid-invoice_2026.pdf", tags)).toEqual(["one", "two", "four"]);
    expect(suggestExistingTags("leased-house.pdf", tags)).toEqual([]);
    expect(suggestExistingTags("unrelated.pdf", tags)).toEqual([]);
  });

  it("never automatically persists tags or categories", () => {
    const file = { fileName: "GST-2026.pdf", category: "unclassified", tagIds: [] as string[] };
    const hint = suggestFileCategory(file.fileName, "company");
    const tags = suggestExistingTags(file.fileName, [{ id: "tag-1", name: "GST" }]);
    expect(hint?.category).toBe("tax");
    expect(tags).toEqual(["tag-1"]);
    expect(file).toEqual({ fileName: "GST-2026.pdf", category: "unclassified", tagIds: [] });
  });
});
