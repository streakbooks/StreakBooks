import { describe, expect, it } from "vitest";
import { getImportDefinition } from "./import-definitions";
import { parseImportCsv, previewImportCsv } from "./import-preflight";

describe("import preflight", () => {
  const contacts = getImportDefinition("contacts", "Customers and suppliers");
  it("parses quoted commas, newlines, double quotes and BOM", () => {
    expect(
      parseImportCsv(
        '\uFEFFname,email\r\n"Acme, Inc.","a""b@example.com"\r\n"Multi\nLine",test@example.com\r\n',
      ),
    ).toEqual([
      ["name", "email"],
      ["Acme, Inc.", 'a"b@example.com'],
      ["Multi\nLine", "test@example.com"],
    ]);
  });
  it("rejects malformed quoted CSV", () => {
    expect(() => parseImportCsv('name\n"unclosed')).toThrow("Unclosed");
  });
  it("rejects embedded and trailing quote corruption", () => {
    expect(() => parseImportCsv('name\nAc"me')).toThrow("Unexpected quote");
    expect(() => parseImportCsv('name\n"Acme"extra')).toThrow("after closing");
    expect(() => parseImportCsv('name\n"Acme""extra')).toThrow("Unclosed");
  });
  it("accepts quoted delimiters and adjacent quoted cells", () => {
    expect(parseImportCsv('a,b\n"x,y","z"')).toEqual([
      ["a", "b"],
      ["x,y", "z"],
    ]);
  });
  it("detects missing required columns and values", () => {
    const missing = previewImportCsv("email\nperson@example.com\n", contacts);
    expect(missing.issues).toContainEqual({
      row: 1,
      field: "name",
      message: "Required column is missing: name",
    });
    const blank = previewImportCsv("name,kind\n,customer\n", contacts);
    expect(blank.issues).toContainEqual({
      row: 2,
      field: "name",
      message: "Required value is missing",
    });
  });
  it("reports duplicate headers, row widths and within-file duplicate keys", () => {
    const p = previewImportCsv("name,name\nAcme,Acme\nAcme,Acme,extra\n", contacts, {
      uniqueBy: ["name"],
    });
    expect(p.duplicates).toEqual([3]);
    expect(p.issues.some((e) => e.message === "Duplicate column heading")).toBe(true);
    expect(p.issues.some((e) => e.message === "Column count differs from header")).toBe(true);
  });
  it("does not mutate imported rows or write records", () => {
    const p = previewImportCsv("name,kind\nAcme,supplier\n", contacts);
    expect(p.records[0]?.values).toMatchObject({ name: "Acme", kind: "supplier" });
    expect(p.issues).toEqual([]);
  });
  it("enforces row limits", () => {
    expect(() => previewImportCsv("name\nA\nB\n", contacts, { maxRows: 1 })).toThrow("maximum");
  });
});
