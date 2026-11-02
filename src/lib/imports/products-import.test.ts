import { describe, expect, it } from "vitest";
import { prepareProductsCsv } from "./products-import";

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
      },
      {
        sourceRow: 3,
        code: "SKU-2",
        name: "Parts",
        kind: "product",
        salesPriceMinor: 150,
        purchaseCostMinor: 25,
      },
    ]);
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
