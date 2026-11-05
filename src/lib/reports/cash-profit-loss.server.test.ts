import { describe, expect, it, vi } from "vitest";
import { loadCashProfitLossInput } from "./cash-profit-loss.server";
import { cashProfitLoss } from "./cash-profit-loss";
import { cashInputFixture } from "./__fixtures__/cash-facts";
import { reportingFactsFixture, testCompany, bankId } from "./__fixtures__/facts";
import { buildReportDocument } from "./report-document";
import { standardSettingsSchema, encodeStandardSettings } from "./standard-settings";
import { cashStandardFacts } from "./cash-standard";
import { exportReportPdf } from "./pdf-export.server";
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
    sales_credit_allocations: [],
    purchase_credit_allocations: [],
    cash_allocation_history: [],
    money_documents: [],
    money_document_credit_uses: [],
    sales_invoices: [
      { id: "invoice", company_id: testCompany, posted_journal_id: "invoice-journal" },
    ],
    purchase_bills: [{ id: "bill", company_id: testCompany, posted_journal_id: "bill-journal" }],
    sales_credit_notes: [],
    purchase_credit_notes: [],
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
  it("resolves real document foreign keys when legacy posted journals have no source_id", async () => {
    const db = database();
    for (const line of db.data["journal_lines"]!) {
      const header = line["journals"] as Row;
      if (["sales_invoice", "purchase_bill"].includes(String(header["source_type"])))
        header["source_id"] = null;
    }
    const input = await loadCashProfitLossInput(db.sb, db.facts, "2026-11-30");
    const rows = cashProfitLoss(input, { from: "2026-11-01", to: "2026-11-30" });
    expect(rows.reduce((sum, row) => sum + row.credit - row.debit, 0n)).toBe(1000n);
    expect(rows.map((row) => row.sourceId)).toEqual(["invoice", "bill"]);
    expect(db.data["journal_lines"]![0]!["journals"]).toHaveProperty("source_id", null);
  });
  it("keeps a receipt applied to a future-dated posted invoice as an advance until that invoice date", async () => {
    const db = database();
    db.data["sales_invoices"]![0]!["invoice_date"] = "2026-12-10";
    for (const line of db.data["journal_lines"]!) {
      const header = line["journals"] as Row;
      if (header["id"] === "invoice-journal") header["journal_date"] = "2026-12-10";
    }
    const november = await loadCashProfitLossInput(db.sb, db.facts, "2026-11-30");
    expect(
      cashProfitLoss(november, { from: "2026-11-01", to: "2026-11-30" }).reduce(
        (sum, row) => sum + row.credit - row.debit,
        0n,
      ),
    ).toBe(-4000n);
    const december = await loadCashProfitLossInput(db.sb, db.facts, "2026-12-31");
    expect(
      cashProfitLoss(december, { from: "2026-12-01", to: "2026-12-31" }).reduce(
        (sum, row) => sum + row.credit - row.debit,
        0n,
      ),
    ).toBe(5000n);
  });
  it("rejects cross-company and contradictory document journal mappings", async () => {
    const db = database();
    db.data["sales_invoices"]![0]!["posted_journal_id"] = "bill-journal";
    const input = await loadCashProfitLossInput(db.sb, db.facts, "2026-11-30");
    expect(() => cashProfitLoss(input, { from: "2026-11-01", to: "2026-11-30" })).toThrow(
      "does not match",
    );
    input.documentJournalLinks![0]!.companyId = "other";
    expect(() => cashProfitLoss(input, { from: "2026-11-01", to: "2026-11-30" })).toThrow(
      "Cross-company",
    );
  });
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
  it("restores the exact archived supplier split for a report before a later void", async () => {
    const db = database();
    const original = db.data["supplier_payment_allocations"]!.pop()!;
    db.data["supplier_payments"]![0]!["void_journal_id"] = "later-void";
    db.data["cash_allocation_history"] = [
      {
        id: "archive",
        company_id: testCompany,
        source_table: "supplier_payment_allocations",
        allocation_id: original["id"],
        operation: "DELETE",
        source_row: original,
      },
    ];
    const input = await loadCashProfitLossInput(db.sb, db.facts, "2026-11-30");
    expect(input.allocations.find((row) => row.id === original["id"])?.amount).toBe(4800n);
    expect(
      cashProfitLoss(input, { from: "2026-11-01", to: "2026-11-30" }).reduce(
        (sum, row) => sum + row.credit - row.debit,
        0n,
      ),
    ).toBe(1000n);
  });
  it("refuses to reuse deleted splits for an unvoided payment or changed allocations", async () => {
    const db = database();
    const original = db.data["supplier_payment_allocations"]!.pop()!;
    const event = {
      id: "archive",
      company_id: testCompany,
      source_table: "supplier_payment_allocations",
      allocation_id: original["id"],
      operation: "DELETE",
      source_row: original,
    };
    db.data["cash_allocation_history"] = [event];
    await expect(loadCashProfitLossInput(db.sb, db.facts, "2026-11-30")).rejects.toThrow(
      "matching source void",
    );
    event.operation = "UPDATE";
    await expect(loadCashProfitLossInput(db.sb, db.facts, "2026-11-30")).rejects.toThrow(
      "reallocation recognition history",
    );
  });
  it("ignores archived compensation for supplier payments and refunds that never posted", async () => {
    const db = database();
    const draftPayment = {
      ...db.data["supplier_payments"]![0],
      id: "draft-payment",
      posted_journal_id: null,
    };
    db.data["supplier_payments"]!.push(draftPayment);
    db.data["money_documents"]!.push({
      id: "failed-refund",
      company_id: testCompany,
      posted_journal_id: null,
    });
    db.data["cash_allocation_history"] = [
      {
        id: "failed-payment-split",
        company_id: testCompany,
        source_table: "supplier_payment_allocations",
        allocation_id: "draft-allocation",
        operation: "DELETE",
        source_row: {
          ...db.data["supplier_payment_allocations"]![0],
          id: "draft-allocation",
          payment_id: "draft-payment",
        },
      },
      {
        id: "failed-refund-use",
        company_id: testCompany,
        source_table: "money_document_credit_uses",
        allocation_id: "failed-use",
        operation: "DELETE",
        source_row: { id: "failed-use", company_id: testCompany, document_id: "failed-refund" },
      },
    ];
    const input = await loadCashProfitLossInput(db.sb, db.facts, "2026-11-30");
    expect(input.payments).toHaveLength(2);
    expect(input.refunds).toEqual([]);
    expect(input.allocations).toHaveLength(2);
    expect(
      cashProfitLoss(input, { from: "2026-11-01", to: "2026-11-30" }).reduce(
        (sum, row) => sum + row.credit - row.debit,
        0n,
      ),
    ).toBe(1000n);
  });
  it.each(["profit-and-loss", "balance-sheet"] as const)(
    "renders frozen %s cash delivery facts with the same engine as preview and PDF export",
    async (report) => {
      const db = database();
      const settings = standardSettingsSchema.parse({
        basis: "cash",
        group: "month",
        compare: "prior_period",
      });
      const definition = {
        name: "Cash P&L",
        reportId: report,
        config: { settings: encodeStandardSettings(settings) },
      };
      const facts = { ...db.facts, from: "2026-11-01", to: "2026-11-30" };
      const snapshot = JSON.stringify({ ...facts, cashSourceVersion: 1, cashSource: db.data });
      const input = await loadCashProfitLossInput(db.sb, facts, facts.to);
      const preview = buildReportDocument(
        cashStandardFacts(facts, input, settings, report),
        definition,
      );
      const attachment = buildReportDocument(JSON.parse(snapshot), definition);
      expect(attachment).toEqual(preview);
      expect(buildReportDocument(JSON.parse(snapshot), definition)).toEqual(attachment);
      db.data["supplier_payment_allocations"] = [];
      expect(buildReportDocument(JSON.parse(snapshot), definition)).toEqual(attachment);
      const bytes = await exportReportPdf(attachment);
      expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
      const wrongBasis = {
        ...definition,
        config: { settings: encodeStandardSettings(standardSettingsSchema.parse({})) },
      };
      expect(() => buildReportDocument(JSON.parse(snapshot), wrongBasis)).toThrow(
        "accounting basis",
      );
    },
  );
  it("rejects unsafe numeric API amounts instead of silently rounding financial facts", async () => {
    const db = database();
    db.data["sales_receipts"]![0]!["amount_minor"] = Number.MAX_SAFE_INTEGER + 1;
    await expect(loadCashProfitLossInput(db.sb, db.facts, "2026-11-30")).rejects.toThrow(
      "safe API integer precision",
    );
  });
});
