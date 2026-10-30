import { describe, expect, it } from "vitest";
import { prepareTransactionCsv } from "./transaction-import-validation";

const sales = "Invoice Number,Customer,Invoice Date,Due Date,Revenue Account,Description,Quantity,Unit Price,Tax Code";
const bills = "Bill Number,Supplier,Bill Date,Due Date,Expense Account,Description,Quantity,Unit Price";

describe("Sales and Purchases import preflight (non-posting)", () => {
  it("groups invoice lines with a consistent document header", () => {
    const rows = prepareTransactionCsv(
      `${sales}\nI-1,Acme,2026-10-01,2026-10-30,4000,Consulting,1,100.00,GST\nI-1,Acme,2026-10-01,2026-10-30,4000,Extra,2,50.00,GST`,
      "sales", "USD",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lines).toHaveLength(2);
    expect(rows[0]!.lines[1]!.unitPriceMinor).toBe(5000);
  });
  it("validates purchase bill lines using the same shared contract", () => {
    const rows = prepareTransactionCsv(
      `${bills}\nB-1,Office Co,2026-10-01,2026-11-01,6000,Paper,2,15.25`,
      "purchases", "USD",
    );
    expect(rows[0]!.lines[0]!.unitPriceMinor).toBe(1525);
  });
  it("rejects nonexistent dates and reversed document periods", () => {
    expect(() => prepareTransactionCsv(`${sales}\nI-1,Acme,2026-02-30,2026-10-31,4000,Test,1,1,`, "sales", "USD")).toThrow(/date/);
    expect(() => prepareTransactionCsv(`${bills}\nB-1,Acme,2026-10-30,2026-10-01,6000,Test,1,1`, "purchases", "USD")).toThrow(/precedes/);
  });
  it("rejects inconsistent document headers, excessive precision and unsafe amounts", () => {
    expect(() => prepareTransactionCsv(`${sales}\nI-1,Acme,2026-10-01,2026-10-31,4000,Test,1,1,\nI-1,Other,2026-10-01,2026-10-31,4000,Test,1,1,`, "sales", "USD")).toThrow(/conflicting header/);
    expect(() => prepareTransactionCsv(`${bills}\nB-1,Acme,2026-10-01,2026-10-31,6000,Test,1,1.999`, "purchases", "USD")).toThrow(/precision/);
    expect(() => prepareTransactionCsv(`${bills}\nB-1,Acme,2026-10-01,2026-10-31,6000,Test,1,9999999999999999999`, "purchases", "USD")).toThrow(/safe integer/);
  });
  it("rejects zero quantity and invalid CSV without writes", () => {
    expect(() => prepareTransactionCsv(`${sales}\nI-1,Acme,2026-10-01,2026-10-31,4000,Test,0,1,`, "sales", "USD")).toThrow(/positive/);
    expect(() => prepareTransactionCsv(`Invoice Number,Customer\nI-1,Acme`, "sales", "USD")).toThrow(/required column/);
  });
});
