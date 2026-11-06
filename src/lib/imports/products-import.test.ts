import { describe, expect, it } from "vitest";
import { prepareProductsCsv } from "./products-import";
import { productsToCsv } from "@/lib/products/catalogue-csv";

describe("products catalogue CSV import validation", () => {
  const header = "SKU,Name,Type,Sale Price,Purchase Price";
  it("parses valid products and services into exact minor units", () => {
    expect(
      prepareProductsCsv(
        `${header}\nSKU-1,Consulting,service,100.25,0\nSKU-2,Parts,product,1.50,0.25`,
        "USD",
      ),
    ).toEqual([
      {
        sourceRow: 2,
        code: "SKU-1",
        name: "Consulting",
        kind: "service",
        salesPriceMinor: 10025,
        purchaseCostMinor: 0,
        description: null,
        unit: "each",
        salesTaxRateBps: 0,
        purchaseTaxRateBps: 0,
        incomeAccountId: null,
        expenseAccountId: null,
        categoryId: null,
      },
      {
        sourceRow: 3,
        code: "SKU-2",
        name: "Parts",
        kind: "product",
        salesPriceMinor: 150,
        purchaseCostMinor: 25,
        description: null,
        unit: "each",
        salesTaxRateBps: 0,
        purchaseTaxRateBps: 0,
        incomeAccountId: null,
        expenseAccountId: null,
        categoryId: null,
      },
    ]);
  });
  it("imports optional fields from an active catalogue export without loss", () => {
    const incomeId = "11111111-1111-4111-8111-111111111111";
    const expenseId = "22222222-2222-4222-8222-222222222222";
    const csv = productsToCsv(
      [
        {
          code: "CONSULT-001",
          name: "Consulting",
          kind: "service",
          description: 'Detailed "scope", line one\nline two',
          unit: "hour",
          sales_price_minor: 123456,
          purchase_cost_minor: 2500,
          sales_tax_rate_bps: 1875,
          purchase_tax_rate_bps: 550,
          is_active: true,
          income_account_id: incomeId,
          expense_account_id: expenseId,
        },
      ],
      "AUD",
    );
    expect(prepareProductsCsv(csv, "AUD")).toEqual([
      {
        sourceRow: 2,
        code: "CONSULT-001",
        name: "Consulting",
        kind: "service",
        salesPriceMinor: 123456,
        purchaseCostMinor: 2500,
        description: 'Detailed "scope", line one\nline two',
        unit: "hour",
        salesTaxRateBps: 1875,
        purchaseTaxRateBps: 550,
        incomeAccountId: incomeId,
        expenseAccountId: expenseId,
        categoryId: null,
      },
    ]);
  });

  const extended =
    "SKU,Name,Type,Sale Price,Purchase Price,Description,Unit,Sales Tax (%),Purchase Tax (%),Status,Income Account ID,Expense Account ID";

  it("rejects archived report rows instead of silently reactivating them", () => {
    expect(() =>
      prepareProductsCsv(
        `${extended}\nITEM-1,Archive,service,10.00,0,,each,0,0,Archived,,`,
        "USD",
      ),
    ).toThrow(/Row 2.*Only Active items/);
  });

  it("rejects inaccurate or out-of-range tax percentages", () => {
    for (const salesTax of ["1.234", "-1", "100.01", "not-a-number"]) {
      expect(() =>
        prepareProductsCsv(
          `${extended}\nITEM-1,Tax,service,10,0,,each,${salesTax},0,Active,,`,
          "USD",
        ),
      ).toThrow(/Row 2.*Sales Tax/);
    }
    expect(prepareProductsCsv(
      `${extended}\nITEM-1,Tax,service,10,0,,each,0.01,100,Active,,`,
      "USD",
    )[0]?.purchaseTaxRateBps).toBe(10000);
  });

  it("rejects invalid account identifiers and excessively long item metadata", () => {
    expect(() => prepareProductsCsv(
      `${extended}\nITEM-1,Name,service,10,0,,each,0,0,Active,wrong-id,`,
      "USD",
    )).toThrow(/Income Account ID.*UUID/);
    expect(() => prepareProductsCsv(
      `${extended}\nITEM-1,Name,service,10,0,,${"x".repeat(41)},0,0,Active,,`,
      "USD",
    )).toThrow(/Unit exceeds/);
    expect(() => prepareProductsCsv(
      `${extended}\nITEM-1,Name,service,10,0,${"x".repeat(2001)},each,0,0,Active,,`,
      "USD",
    )).toThrow(/Description exceeds/);
  });

  it("rejects duplicate SKUs even when case differs", () => {
    expect(() =>
      prepareProductsCsv(`${header}\nSKU-1,First,service,1,0\nsku-1,Second,service,1,0`, "USD"),
    ).toThrow(/row 3.*duplicate/i);
  });
  it("rejects invalid kinds and negative prices", () => {
    expect(() => prepareProductsCsv(`${header}\nSKU-1,First,inventory,1,0`, "USD")).toThrow(
      /row 2.*type/i,
    );
    expect(() => prepareProductsCsv(`${header}\nSKU-1,First,service,-1,0`, "USD")).toThrow(
      /row 2.*price/i,
    );
  });
  it("rejects precision loss and uses the organisation currency", () => {
    expect(() => prepareProductsCsv(`${header}\nSKU-1,First,service,1.001,0`, "USD")).toThrow(
      /precision/i,
    );
    expect(() => prepareProductsCsv(`${header}\nSKU-1,First,service,1.01,0`, "JPY")).toThrow(
      /precision/i,
    );
    expect(
      prepareProductsCsv(`${header}\nSKU-1,First,service,1.001,0`, "KWD")[0]?.salesPriceMinor,
    ).toBe(1001);
  });
  it("rejects unsafe numbers, malformed headers and empty files", () => {
    expect(() =>
      prepareProductsCsv(`${header}\nSKU-1,First,service,999999999999999999999,0`, "USD"),
    ).toThrow(/safe/i);
    expect(() => prepareProductsCsv("SKU,Name\nX,First", "USD")).toThrow(/required column/i);
    expect(() => prepareProductsCsv(header, "USD")).toThrow(/no product/i);
  });
  it("rejects unsupported SKU characters and excessive names", () => {
    expect(() => prepareProductsCsv(`${header}\nA%B,First,service,1,0`, "USD")).toThrow(/SKU/i);
    expect(() =>
      prepareProductsCsv(`${header}\nSKU-1,${"x".repeat(201)},service,1,0`, "USD"),
    ).toThrow(/name/i);
  });
});
