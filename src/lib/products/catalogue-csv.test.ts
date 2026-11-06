import { describe, expect, it } from "vitest";
import { catalogueCsvCell, productsToCsv, type CatalogueCsvItem } from "./catalogue-csv";

const row: CatalogueCsvItem = {
  code: "AA-01",
  name: "Service, premium",
  kind: "service",
  description: 'Description "quoted"\nsecond line',
  unit: "hour",
  sales_price_minor: 123456,
  purchase_cost_minor: 10,
  sales_tax_rate_bps: 2000,
  purchase_tax_rate_bps: 500,
  is_active: true,
  income_account_id: null,
  expense_account_id: null,
};

describe("Products and services CSV export", () => {
  it("escapes quotes, commas and multiline fields and preserves exact decimals", () => {
    const csv = productsToCsv([row], "USD");
    expect(csv).toContain('"Service, premium"');
    expect(csv).toContain('"Description ""quoted""\nsecond line"');
    expect(csv).toContain('"1234.56"');
    expect(csv).toContain('"0.10"');
    expect(csv).toContain('"20.00","5.00","Active"');
  });
  it("uses organisation-specific currency minor units", () => {
    expect(productsToCsv([row], "JPY")).toContain('"123456"');
    expect(productsToCsv([row], "KWD")).toContain('"123.456"');
  });
  it("neutralises spreadsheet formulas even with leading whitespace", () => {
    for (const s of ["=SUM(1,1)", "+cmd", "-shell", "@NOW()", "  =1+1", "\t+2"]) {
      expect(catalogueCsvCell(s)).toBe(`"'${s}"`);
    }
    expect(catalogueCsvCell("-123.45")).toBe('"-123.45"');
  });
  it("serialises an empty export with a header only", () => {
    const csv = productsToCsv([], "AUD");
    expect(csv).toContain('"SKU","Name","Type"');
    expect(csv.split("\r\n").length).toBe(2);
  });
});
