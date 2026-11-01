import { describe, expect, it } from "vitest";
import { prepareTransactionCsv, validateResolvedTransactionTotals, type TransactionImportDocument } from "./transaction-import-validation";

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
    expect(() => prepareTransactionCsv(`Invoice Number,Customer\nI-1,Acme`, "sales", "USD")).toThrow(/required column is missing/i);
  });
  it("groups invoice numbers case-insensitively for retry protection", () => {
    const docs = prepareTransactionCsv(`${sales}\nI-1,Acme,2026-10-01,2026-10-31,4000,A,1,1,\ni-1,Acme,2026-10-01,2026-10-31,4000,B,1,2,`, "sales", "USD");
    expect(docs).toHaveLength(1);
    expect(docs[0]!.lines).toHaveLength(2);
  });
  it("keeps identical bill numbers for different suppliers separate", () => {
    const docs = prepareTransactionCsv(`${bills}\nB-1,Alpha,2026-10-01,2026-10-31,6000,A,1,1\nB-1,Beta,2026-10-01,2026-10-31,6000,B,1,1`, "purchases", "USD");
    expect(docs).toHaveLength(2);
  });
  it("rejects a zero-value bill", () => {
    expect(() => prepareTransactionCsv(`${bills}\nB-0,Alpha,2026-10-01,2026-10-31,6000,A,1,0`, "purchases", "USD")).toThrow(/no monetary value/);
  });
  it("merges case-only invoice identifiers consistently with the database unique index", () => {
    const csv = `${sales}\nINV-9,Acme,2026-10-01,2026-10-31,4000,First,1,1.00,\ninv-9,Acme,2026-10-01,2026-10-31,4000,Second,1,2.00,`;
    const docs = prepareTransactionCsv(csv, "sales", "USD");
    expect(docs).toHaveLength(1);
    expect(docs[0]?.lines).toHaveLength(2);
  });
  it("allows the same supplier reference for separate suppliers", () => {
    const csv = `${bills}\nB-5,Supplier One,2026-10-01,2026-10-31,6000,First,1,5.00\nB-5,Supplier Two,2026-10-01,2026-10-31,6000,Second,1,6.00`;
    const docs = prepareTransactionCsv(csv, "purchases", "USD");
    expect(docs).toHaveLength(2);
  });
  it("rejects zero-value documents before any account or contact writes", () => {
    expect(() => prepareTransactionCsv(
      `${sales}\nINV-0,Acme,2026-10-01,2026-10-31,4000,Test,1,0.00,`,
      "sales", "USD",
    )).toThrow(/no monetary value/);
  });


  it("uses the real Sales half-up and Purchases truncation rules for fractional quantities", () => {
    const salesCsv = `${sales}\nROUND-1,Acme,2026-10-01,2026-10-31,4000,Half cent,0.5,0.01,`;
    const billCsv = `${bills}\nROUND-1,Acme,2026-10-01,2026-10-31,6000,Half cent,0.5,0.01`;
    // Sales posts one minor unit; Purchases truncates to zero. A zero-value
    // bill must not be created as a misleading draft that cannot be posted.
    expect(prepareTransactionCsv(salesCsv, "sales", "USD")).toHaveLength(1);
    expect(() => prepareTransactionCsv(billCsv, "purchases", "USD")).toThrow(/no monetary value/);
  });

  it.each(["sales", "purchases"] as const)(
    "rejects aggregate %s document totals that overflow safe integer range",
    (kind) => {
      const header = kind === "sales" ? sales : bills;
      const number = kind === "sales" ? "INV-BIG" : "BILL-BIG";
      const account = kind === "sales" ? "4000" : "6000";
      const tax = kind === "sales" ? "," : "";
      const line = `${number},Acme,2026-10-01,2026-10-31,${account},Large,1,50000000000000.00${tax}`;
      expect(() => prepareTransactionCsv(`${header}\n${line}\n${line}`, kind, "USD"))
        .toThrow(/document .* total exceeds safe integer range/);
    },
  );

  it("does not aggregate amounts across separate documents", () => {
    const csv = `${sales}\nINV-A,Acme,2026-10-01,2026-10-31,4000,Large,1,50000000000000.00,\nINV-B,Acme,2026-10-01,2026-10-31,4000,Large,1,50000000000000.00,`;
    expect(prepareTransactionCsv(csv, "sales", "USD")).toHaveLength(2);
  });
});

describe("resolved Sales/Purchases totals (read-only, before draft writes)", () => {
  const document: TransactionImportDocument = {
    documentNumber: "DOC-1", contactName: "Acme",
    documentDate: "2026-10-01", dueDate: "2026-10-31",
    lines: [{
      sourceRow: 2, documentNumber: "DOC-1", contactName: "Acme",
      documentDate: "2026-10-01", dueDate: "2026-10-31",
      accountCode: "4000", description: "Consulting",
      quantity: 2, unitPriceMinor: 1250, taxCode: "TAX10",
    }],
  };

  it.each(["sales", "purchases"] as const)("calculates %s net, tax and gross with domain rounding", (kind) => {
    expect(validateResolvedTransactionTotals(document, kind, [1000])).toEqual({
      subtotalMinor: 2500n, taxMinor: 250n, totalMinor: 2750n,
    });
  });

  it("honours inclusive Sales pricing and does not double-add tax", () => {
    expect(validateResolvedTransactionTotals(document, "sales", [1000], "inclusive")).toEqual({
      subtotalMinor: 2273n, taxMinor: 227n, totalMinor: 2500n,
    });
  });

  it.each(["sales", "purchases"] as const)(
    "rejects %s when tax pushes an otherwise safe net above MAX_SAFE_INTEGER",
    (kind) => {
      const large = { ...document, lines: [{ ...document.lines[0]!, quantity: 1, unitPriceMinor: 8_000_000_000_000_000 }] };
      expect(() => validateResolvedTransactionTotals(large, kind, [2500])).toThrow(/document DOC-1 total exceeds safe integer range/);
    },
  );

  it("rejects aggregated tax-inclusive document overflow before any draft is created", () => {
    const first = { ...document.lines[0]!, quantity: 1, unitPriceMinor: 4_500_000_000_000_000 };
    const large = { ...document, lines: [first, { ...first, sourceRow: 3 }] };
    expect(() => validateResolvedTransactionTotals(large, "sales", [100, 100]))
      .toThrow(/Row 3: document DOC-1 total exceeds safe integer range/);
  });

  it("requires a complete, valid tax-rate mapping", () => {
    expect(() => validateResolvedTransactionTotals(document, "sales", [])).toThrow(/mapping is incomplete/);
    expect(() => validateResolvedTransactionTotals(document, "purchases", [10001])).toThrow(/Tax rate must/);
  });

  it("preserves half-up Sales and truncating Purchases fractional quantity behaviour", () => {
    const fractional = { ...document, lines: [{ ...document.lines[0]!, quantity: 0.5, unitPriceMinor: 1 }] };
    expect(validateResolvedTransactionTotals(fractional, "sales", [0]).totalMinor).toBe(1n);
    expect(() => validateResolvedTransactionTotals(fractional, "purchases", [0]))
      .toThrow(/no monetary value/);
  });
});
