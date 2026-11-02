import { describe, expect, it } from "vitest";
import {
  getImportDefinition,
  IMPORT_DEFINITIONS,
  importFieldDictionaryCsv,
  importTemplateCsv,
} from "./import-definitions";

describe("shared import definitions", () => {
  it("has one nonempty, uniquely keyed schema for every supported module", () => {
    expect(new Set(IMPORT_DEFINITIONS.map((d) => d.module)).size).toBe(12);
    for (const definition of IMPORT_DEFINITIONS) {
      expect(definition.fields.length).toBeGreaterThan(0);
      expect(new Set(definition.fields.map((f) => f.key)).size).toBe(definition.fields.length);
      expect(definition.fields.some((f) => f.required)).toBe(true);
    }
  });

  it("generates a valid header and example CSV for banking", () => {
    const csv = importTemplateCsv(getImportDefinition("banking", "Bank transactions"));
    expect(csv).toContain(
      "Date,Description,Amount,Payee,Reference,Bank Transaction ID,Running Balance",
    );
    expect(csv).toContain("2026-10-01,Example payment,125.00");
  });

  it("creates a field dictionary with required indicators", () => {
    const csv = importFieldDictionaryCsv(getImportDefinition("fixed_assets", "Asset register"));
    expect(csv).toContain("Field,Required,Description,Example");
    expect(csv).toContain("Acquisition Date,Yes");
  });

  it("does not misrepresent unavailable domain writers", () => {
    expect(getImportDefinition("sales", "Invoices").writeStatus).toBe("not_implemented");
    expect(getImportDefinition("fixed_assets", "Asset register").writeStatus).toBe("implemented");
    expect(() => getImportDefinition("sales", "Nonexistent")).toThrow("Unknown import definition");
  });
});
