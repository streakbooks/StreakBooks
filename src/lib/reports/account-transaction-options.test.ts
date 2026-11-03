import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRANSACTION_COLUMNS,
  filterTransactionRows,
  parseTransactionColumns,
} from "./account-transaction-options";

const rows = [
  {
    line_id: "1",
    journal_id: "j1",
    journal_number: 1,
    journal_date: "2026-01-01",
    source_type: "sales_invoice",
    source_id: "invoice-1",
    memo: "Customer A",
    description: "Consulting",
    debit_minor: 200n,
    credit_minor: 0n,
    running_balance_minor: 300n,
  },
  {
    line_id: "2",
    journal_id: "j2",
    journal_number: 2,
    journal_date: "2026-01-02",
    source_type: "supplier_payment",
    source_id: null,
    memo: "Supplier B",
    description: null,
    debit_minor: 0n,
    credit_minor: 50n,
    running_balance_minor: 250n,
  },
  {
    line_id: "3",
    journal_id: "j3",
    journal_number: 3,
    journal_date: "2026-01-03",
    source_type: "sales_invoice",
    source_id: "invoice-2",
    memo: null,
    description: "Consulting",
    debit_minor: 150n,
    credit_minor: 0n,
    running_balance_minor: 400n,
  },
];
describe("account transactions report configuration", () => {
  it("keeps a valid ordered column selection without duplicates or unsupported columns", () => {
    expect(parseTransactionColumns("balance,date,credit,balance,unknown")).toEqual([
      "balance",
      "date",
      "credit",
    ]);
    expect(parseTransactionColumns("unknown")).toEqual(DEFAULT_TRANSACTION_COLUMNS);
    expect(parseTransactionColumns(null)).toEqual(DEFAULT_TRANSACTION_COLUMNS);
  });
  it("filters the full ledger by source, search term and flow while retaining actual running balances", () => {
    const filtered = filterTransactionRows(rows, {
      source: "sales_invoice",
      query: "consulting",
      flow: "debit",
    });
    expect(filtered.map((r) => r.line_id)).toEqual(["1", "3"]);
    expect(filtered.map((r) => r.running_balance_minor)).toEqual([300n, 400n]);
  });
  it("uses an inclusive absolute movement range without changing running balances", () => {
    expect(
      filterTransactionRows(rows, { minAmountMinor: 150n, maxAmountMinor: 200n }).map(
        (r) => r.line_id,
      ),
    ).toEqual(["1", "3"]);
    expect(
      filterTransactionRows(rows, { maxAmountMinor: 50n }).map((r) => r.running_balance_minor),
    ).toEqual([250n]);
    expect(filterTransactionRows(rows, { minAmountMinor: 201n })).toEqual([]);
  });
  it("sorts by amount and reverse chronology without mutating the original rows", () => {
    expect(filterTransactionRows(rows, { sort: "date_desc" }).map((r) => r.line_id)).toEqual([
      "3",
      "2",
      "1",
    ]);
    expect(filterTransactionRows(rows, { sort: "amount_asc" }).map((r) => r.line_id)).toEqual([
      "2",
      "3",
      "1",
    ]);
    expect(rows.map((r) => r.line_id)).toEqual(["1", "2", "3"]);
  });
  it("does not treat positive debit and credit rows as zero-value movements", () => {
    expect(filterTransactionRows(rows, { flow: "credit" }).map((r) => r.line_id)).toEqual(["2"]);
    expect(filterTransactionRows(rows, { query: "absent" })).toEqual([]);
  });
});
