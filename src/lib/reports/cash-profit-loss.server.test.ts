import { describe, expect, it, vi } from "vitest";
import { loadCashProfitLossInput } from "./cash-profit-loss.server";
import { cashProfitLoss } from "./cash-profit-loss";
import { cashInputFixture } from "./__fixtures__/cash-facts";
import { reportingFactsFixture, testCompany, bankId } from "./__fixtures__/facts";
import type { Sb } from "@/lib/accounting/ledger-data";

type Row = Record<string, unknown>;
function database() {
  const input = cashInputFixture();
  const lines = input.journals.flatMap((journal) =>
    journal.lines.map((line, index) => ({
      id: `${journal.id}-${index}`,
      company_id: testCompany,
      account_id: line.accountId,
      debit_minor: line.debit.toString(),
      credit_minor: line.credit.toString(),
      journals: {
        id: journal.id,
        company_id: testCompany,
        journal_date: journal.date,
        journal_number: journal.number,
        status: "posted",
        source_type: journal.sourceType,
        source_id: journal.sourceId,
        currency_code: journal.currency,
        fx_rate_to_base: journal.rate,
        reverses_journal_id: journal.reverses,
      },
    })),
  );
  const data: Record<string, Row[]> = {
    journal_lines: lines,
    bank_accounts: [{ id: "bank", company_id: testCompany, gl_account_id: bankId }],
    sales_receipts: [
      {
        id: "receipt",
        company_id: testCompany,
        posted_journal_id: "receipt-journal",
        void_journal_id: null,
        receipt_date: "2026-11-02",
        currency_code: "GBP",
        fx_rate_to_base: "1",
        amount_minor: "6000",
      },
    ],
    supplier_payments: [
      {
        id: "payment",
        company_id: testCompany,
        posted_journal_id: "payment-journal",
        void_journal_id: null,
        payment_date: "2026-11-03",
        currency_code: "GBP",
        fx_rate_to_base: "1",
        amount_minor: "4800",
      },
    ],
    sales_receipt_allocations: [
      {
        id: "allocation-ar",
        company_id: testCompany,
        receipt_id: "receipt",
        invoice_id: "invoice",
        amount_minor: "6000",
        reversed_on: null,
      },
    ],
    supplier_payment_allocations: [
      {
        id: "allocation-ap",
        company_id: testCompany,
        payment_id: "payment",
        bill_id: "bill",
        amount_minor: "4800",
      },
    ],
    money_documents: [],
    money_document_credit_uses: [],
  };
  const calls: Array<{ table: string; key: string; value: unknown }> = [];
  const valueAt = (row: Row, key: string): unknown =>
    key.split(".").reduce<unknown>((value, part) => (value as Row)?.[part], row);
  const from = vi.fn((table: string) => {
    let rows = data[table] ?? [];
    const query = {
      select() {
        return query;
      },
      eq(key: string, value: unknown) {
        calls.push({ table, key, value });
        rows = rows.filter((row) => valueAt(row, key) === value);
        return query;
      },
      lte(key: string, value: string) {
        rows = rows.filter((row) => String(valueAt(row, key)) <= value);
        return query;
      },
      order(key: string) {
        expect(key).toBe("id");
        rows = [...rows].sort((a, b) => String(a["id"]).localeCompare(String(b["id"])));
        return query;
      },
      async range(start: number, end: number) {
        return { data: rows.slice(start, Math.min(end + 1, start + 2)), error: null };
      },
    };
    return query;
  });
  const facts = reportingFactsFixture();
  facts.accounts = input.accounts;
  return { sb: { from } as unknown as Sb, facts, calls, data };
}
describe("cash source adapter", () => {
  it("pages actual journal/allocation shapes, scopes every table to company, and computes cash P&L", async () => {
    const db = database();
    db.data["sales_receipts"]!.push({
      ...db.data["sales_receipts"]![0],
      id: "foreign",
      company_id: "other",
      amount_minor: "999999",
    });
    const input = await loadCashProfitLossInput(db.sb, db.facts, "2026-11-30");
    expect(input.payments).toHaveLength(2);
    expect(input.journals).toHaveLength(4);
    const rows = cashProfitLoss(input, { from: "2026-11-01", to: "2026-11-30" });
    expect(rows.reduce((sum, row) => sum + row.credit - row.debit, 0n)).toBe(1000n);
    for (const table of Object.keys(db.data))
      expect(db.calls).toContainEqual({ table, key: "company_id", value: testCompany });
    expect(db.calls).toContainEqual({
      table: "journal_lines",
      key: "journals.company_id",
      value: testCompany,
    });
    expect(db.calls).toContainEqual({
      table: "journal_lines",
      key: "journals.status",
      value: "posted",
    });
  });
  it("rejects unsafe numeric API amounts instead of silently rounding financial facts", async () => {
    const db = database();
    db.data["sales_receipts"]![0]!["amount_minor"] = Number.MAX_SAFE_INTEGER + 1;
    await expect(loadCashProfitLossInput(db.sb, db.facts, "2026-11-30")).rejects.toThrow(
      "safe API integer precision",
    );
  });
});
