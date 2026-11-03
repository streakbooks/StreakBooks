import { describe, expect, it } from "vitest";
import { displayDocumentValue, documentCsvValue, documentNumericValue } from "./document-format";
import type { DocumentRow } from "./report-document";

const style: DocumentRow = {
  label: "",
  values: [],
  kind: "account",
  format: "money",
  scale: "1000",
  decimals: 2,
  negative: "parentheses",
};
describe("mixed report text and financial amounts", () => {
  it.each(["invoice", "2026-01-15", "#14", "001230", "- adjustment", "1e6", "=SUM(A1)"])(
    "preserves literal text %s through shared formatting",
    (value) => {
      expect(displayDocumentValue(value, style)).toBe(value);
      expect(documentNumericValue(value, style)).toBe(value);
      expect(documentCsvValue(value, style)).toBe(value);
    },
  );
  it("continues to scale and format genuine exact financial values", () => {
    expect(displayDocumentValue("-1234.50", style)).toBe("(1.23)");
    expect(documentCsvValue("-1234.50", style)).toBe("-1.23");
  });
});
