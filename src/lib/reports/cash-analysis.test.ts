import { describe, expect, it } from "vitest";
import {
  cashContacts,
  cashItems,
  type CashAnalysisDocument,
  type CashAnalysisLine,
} from "./cash-analysis";
import { cashInputFixture, taxId } from "./__fixtures__/cash-facts";
import { revenueId } from "./__fixtures__/facts";
import { cashLedger } from "./cash-ledger";
import type { CashPnlEntry } from "./cash-profit-loss";

const documents: CashAnalysisDocument[] = [
  {
    id: "invoice",
    posted_journal_id: "invoice-journal",
    contact_id: "customer",
    contact_name: "Customer",
    credit: false,
  },
  {
    id: "bill",
    posted_journal_id: "bill-journal",
    contact_id: "supplier",
    contact_name: "Supplier",
    credit: false,
  },
];
const lines: CashAnalysisLine[] = [
  {
    id: "a",
    document_id: "invoice",
    product_id: "software",
    item_code: "SW",
    item_name: "Software",
    quantity: 6,
    net_minor: "6000",
    tax_minor: "1200",
  },
  {
    id: "b",
    document_id: "invoice",
    product_id: "support",
    item_code: "SUP",
    item_name: "Support",
    quantity: 4,
    net_minor: "4000",
    tax_minor: "800",
  },
];
const taxIds = new Set([taxId]);
const throughNovember = { from: "0001-01-01", to: "2026-11-30" };
function entry(date: string, credit: bigint): CashPnlEntry {
  return {
    accountId: revenueId,
    date,
    journalId: `receipt-${date}`,
    journalNumber: "1",
    sourceJournalId: "invoice-journal",
    sourceType: "sales_invoice",
    sourceId: "invoice",
    debit: credit < 0n ? -credit : 0n,
    credit: credit > 0n ? credit : 0n,
    reason: "settlement",
    sourceTransactionAmount: (-credit).toString(),
  };
}

describe("cash customer, supplier and item analysis", () => {
  it("uses only settled document net and tax, leaving unpaid invoices out", () => {
    const input = cashInputFixture();
    const entries = cashLedger(input, throughNovember);
    expect(
      cashContacts(
        entries,
        documents.filter((doc) => doc.id === "invoice"),
        taxIds,
        "income",
      ),
    ).toEqual([
      {
        contact_id: "customer",
        contact_name: "Customer",
        document_count: 1,
        credit_note_count: 0,
        net_minor: 5000,
        tax_minor: 1000,
        gross_minor: 6000,
      },
    ]);
    expect(
      cashContacts(
        entries,
        documents.filter((doc) => doc.id === "bill"),
        taxIds,
        "expense",
      ).find((row) => row.contact_id === "supplier"),
    ).toMatchObject({ net_minor: 4000, tax_minor: 800, gross_minor: 4800 });
    input.allocations = [];
    expect(cashContacts(cashLedger(input, throughNovember), documents, taxIds, "income")).toEqual(
      [],
    );
  });
  it("reconciles item amounts to recognized income and uses transaction currency for paid quantities", () => {
    const input = cashInputFixture();
    for (const journal of input.journals.filter(
      (j) => j.id === "invoice-journal" || j.id === "receipt-journal",
    )) {
      journal.currency = "USD";
      journal.rate = "0.8";
    }
    const receipt = input.payments.find((payment) => payment.side === "income")!;
    receipt.currency = "USD";
    receipt.rate = "0.8";
    const result = cashItems(
      cashLedger(input, throughNovember),
      documents.filter((doc) => doc.id === "invoice"),
      lines,
      taxIds,
      "2026-11-01",
    );
    expect(
      result.map((row) => [row.product_id, row.net_minor, row.tax_minor, row.quantity]),
    ).toEqual([
      ["software", 2400, 480, 3],
      ["support", 1600, 320, 2],
    ]);
    expect(result.reduce((sum, row) => sum + row.net_minor, 0)).toBe(4000);
  });
  it("recognizes only the current period item pennies without reversing an earlier item", () => {
    const pennyLines = [5, 3, 1].map((amount, index): CashAnalysisLine => ({
      ...lines[0]!,
      id: String(index),
      product_id: String(index),
      net_minor: String(amount),
      tax_minor: "0",
      quantity: amount,
    }));
    const result = cashItems(
      [entry("2026-11-30", 4n), entry("2026-12-01", 1n)],
      documents,
      pennyLines,
      taxIds,
      "2026-12-01",
    );
    expect(result.every((row) => row.net_minor >= 0)).toBe(true);
    expect(result.reduce((sum, row) => sum + row.net_minor, 0)).toBe(1);
    expect(result.reduce((sum, row) => sum + row.quantity, 0)).toBeCloseTo(1);
  });
  it("reverses received income for the refund date and keeps credit note counts", () => {
    const creditDocument = { ...documents[0]!, credit: true };
    const result = cashContacts([entry("2026-12-04", -2500n)], [creditDocument], taxIds, "income");
    expect(result).toEqual([
      {
        contact_id: "customer",
        contact_name: "Customer",
        document_count: 0,
        credit_note_count: 1,
        net_minor: -2500,
        tax_minor: 0,
        gross_minor: -2500,
      },
    ]);
  });
  it("rejects amounts outside numeric report precision instead of rounding financial totals", () => {
    expect(() =>
      cashContacts(
        [entry("2026-11-02", BigInt(Number.MAX_SAFE_INTEGER) + 1n)],
        documents,
        taxIds,
        "income",
      ),
    ).toThrow("supported numeric range");
  });
});
