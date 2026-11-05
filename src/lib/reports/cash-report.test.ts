import { describe, expect, it } from "vitest";
import { cashInputFixture, arId, taxId } from "./__fixtures__/cash-facts";
import { bankId, revenueId } from "./__fixtures__/facts";
import { cashProfitLoss } from "./cash-profit-loss";
import { cashEntriesToPostedLines, filterCashEntries } from "./cash-report";
import { reportFiltersSchema } from "./report-filters";

const period = { from: "2026-11-01", to: "2026-11-30" };
const descriptionFilter = reportFiltersSchema.parse({
  clauses: [{ field: "description", op: "contains", values: ["Support"] }],
});
function splitSource() {
  const input = cashInputFixture();
  input.journals[0]!.lines = [
    { accountId: arId, debit: 12000n, credit: 0n },
    { accountId: revenueId, debit: 0n, credit: 6000n, description: "Software", lineId: "software" },
    { accountId: revenueId, debit: 0n, credit: 4000n, description: "Support", lineId: "support" },
    { accountId: taxId, debit: 0n, credit: 2000n },
  ];
  return input;
}
describe("cash recognition filters and ledger attribution", () => {
  it("gives same-day unallocation and reapplication distinct ledger row IDs", () => {
    const input = cashInputFixture();
    const receipt = cashProfitLoss(input, period).find((row) => row.accountId === revenueId)!;
    const entries = [receipt, { ...receipt, debit: receipt.credit, credit: 0n }, { ...receipt }];
    const rows = cashEntriesToPostedLines(input, entries);
    expect(new Set(rows.map((row) => row.line_id)).size).toBe(3);
    expect(
      rows.reduce((sum, row) => sum + BigInt(row.credit_minor) - BigInt(row.debit_minor), 0n),
    ).toBe(receipt.credit);
  });

  it("filters only the recognized share of a matching source line on a shared account", () => {
    const input = splitSource();
    const entries = cashProfitLoss(input, period);
    const filtered = filterCashEntries(entries, input, descriptionFilter);
    expect(filtered.map((row) => row.credit)).toEqual([2000n]);
    const lines = cashEntriesToPostedLines(input, entries).filter(
      (line) => line.account_id === revenueId,
    );
    expect(lines.map((line) => [line.description, line.credit_minor])).toEqual([
      ["Software", 3000n],
      ["Support", 2000n],
    ]);
    expect(lines.reduce((sum, line) => sum + BigInt(line.credit_minor), 0n)).toBe(5000n);
  });
  it("preserves source-line attribution for a later void in a separate reporting period", () => {
    const input = splitSource();
    input.payments[0]!.voidJournalId = "void";
    const original = input.journals[2]!;
    input.journals.push({
      ...original,
      id: "void",
      date: "2026-12-02",
      number: "void",
      reverses: original.id,
      lines: original.lines.map((line) => ({ ...line, debit: line.credit, credit: line.debit })),
    });
    const filtered = filterCashEntries(
      cashProfitLoss(input, { from: "2026-12-01", to: "2026-12-31" }),
      input,
      descriptionFilter,
    );
    expect(filtered.map((row) => [row.debit, row.credit])).toEqual([[2000n, 0n]]);
  });
  it("retains separate descriptions on directly paid same-account lines", () => {
    const input = cashInputFixture();
    input.journals.push({
      id: "cash-sale",
      companyId: input.companyId,
      date: "2026-11-10",
      number: "5",
      sourceType: "sales_receipt",
      sourceId: "cash-sale",
      currency: "GBP",
      rate: "1",
      reverses: null,
      lines: [
        { accountId: bankId, debit: 10000n, credit: 0n },
        { accountId: revenueId, debit: 0n, credit: 6000n, description: "Software" },
        { accountId: revenueId, debit: 0n, credit: 4000n, description: "Support" },
      ],
    });
    const filtered = filterCashEntries(cashProfitLoss(input, period), input, descriptionFilter);
    expect(filtered.map((row) => row.credit)).toEqual([4000n]);
  });
  it("uses recognition dates and exact base-currency amount filters", () => {
    const input = cashInputFixture();
    const entries = cashProfitLoss(input, period);
    const filter = reportFiltersSchema.parse({
      clauses: [
        { field: "journal_date", op: "eq", values: ["2026-11-02"] },
        { field: "credit", op: "between", values: ["50.00", "50.00"] },
      ],
    });
    expect(filterCashEntries(entries, input, filter).map((row) => row.accountId)).toEqual([
      revenueId,
    ]);
  });
});
