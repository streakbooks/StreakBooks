import { describe, expect, it } from "vitest";
import { cashInputFixture } from "@/lib/reports/__fixtures__/cash-facts";
import { bankId, revenueId, expenseId, testCompany } from "@/lib/reports/__fixtures__/facts";
import { arId } from "@/lib/reports/__fixtures__/cash-facts";
import { cashProjectProfitability, type ProjectSourceLine } from "./cash-project";
import type { ProjectProfitRow } from "./projects";

const projects: ProjectProfitRow[] = ["a", "b"].map((id) => ({
  projectId: id,
  code: id,
  name: id,
  status: "active",
  budgetMinor: 20000,
  revenueMinor: 0,
  costMinor: 0,
  profitMinor: 0,
  unconvertedDocuments: 0,
}));
const invoice = (projectId: string | null, netMinor: bigint): ProjectSourceLine => ({
  sourceType: "sales_invoice",
  sourceId: "invoice",
  accountId: revenueId,
  projectId,
  netMinor,
});
const run = (from: string, to: string, lines = [invoice("a", 10000n)]) =>
  cashProjectProfitability(cashInputFixture(), projects, lines, [], { from, to });

describe("cash project profitability", () => {
  it("excludes unpaid invoices and bills in their issue period", () => {
    expect(run("2026-10-01", "2026-10-31").map((r) => r.revenueMinor)).toEqual([0, 0]);
  });

  it("allocates only paid net revenue and costs and retains untagged shares", () => {
    const rows = run("2026-11-01", "2026-11-30", [
      invoice("a", 3000n),
      invoice(null, 7000n),
      {
        sourceType: "purchase_bill",
        sourceId: "bill",
        accountId: expenseId,
        projectId: "b",
        netMinor: 8000n,
      },
    ]);
    expect(rows.map((r) => [r.revenueMinor, r.costMinor, r.profitMinor])).toEqual([
      [1500, 0, 1500],
      [0, 4000, -4000],
    ]);
  });

  it("keeps project pennies consistent when an invoice is paid across months", () => {
    const input = cashInputFixture();
    input.journals.push({
      id: "receipt-2-journal",
      companyId: testCompany,
      date: "2026-12-01",
      number: "R2",
      sourceType: "customer_payment",
      sourceId: "receipt-2",
      currency: "GBP",
      rate: "1",
      reverses: null,
      lines: [
        { accountId: bankId, debit: 6000n, credit: 0n },
        { accountId: arId, debit: 0n, credit: 6000n },
      ],
    });
    input.payments.push({ ...input.payments[0]!, id: "receipt-2", journalId: "receipt-2-journal" });
    input.allocations.push({
      ...input.allocations[0]!,
      id: "allocation-2",
      paymentId: "receipt-2",
    });
    const lines = [invoice("a", 3333n), invoice("b", 3333n), invoice(null, 3334n)];
    const month = (from: string, to: string) =>
      cashProjectProfitability(input, projects, lines, [], { from, to });
    const first = month("2026-11-01", "2026-11-30"),
      second = month("2026-12-01", "2026-12-31");
    const whole = month("2026-11-01", "2026-12-31");
    expect(whole.map((r) => r.revenueMinor)).toEqual([3333, 3333]);
    expect(first.map((r, index) => r.revenueMinor + second[index]!.revenueMinor)).toEqual(
      whole.map((r) => r.revenueMinor),
    );
  });

  it("reverses the previously recognised project share on the payment void date", () => {
    const input = cashInputFixture();
    input.payments[0]!.voidJournalId = "receipt-void";
    input.journals.push({
      ...input.journals[2]!,
      id: "receipt-void",
      date: "2026-12-01",
      number: "VOID",
      reverses: "receipt-journal",
      lines: input.journals[2]!.lines.map((line) => ({
        ...line,
        debit: line.credit,
        credit: line.debit,
      })),
    });
    const rows = cashProjectProfitability(
      input,
      projects,
      [invoice("a", 3000n), invoice(null, 7000n)],
      [],
      {
        from: "2026-12-01",
        to: "2026-12-31",
      },
    );
    expect(rows[0]!.revenueMinor).toBe(-1500);
  });

  it("includes a tagged direct cash sale without counting its bank leg as income", () => {
    const input = cashInputFixture();
    input.journals.push({
      id: "cash-sale",
      companyId: testCompany,
      date: "2026-11-09",
      number: "CS",
      sourceType: "cash_sale",
      sourceId: "money-1",
      currency: "GBP",
      rate: "1",
      reverses: null,
      lines: [
        { accountId: bankId, debit: 123n, credit: 0n },
        { accountId: revenueId, debit: 0n, credit: 123n },
      ],
    });
    const rows = cashProjectProfitability(
      input,
      projects,
      [],
      [{ sourceId: "money-1", projectId: "b" }],
      {
        from: "2026-11-01",
        to: "2026-11-30",
      },
    );
    expect(rows.map((r) => r.revenueMinor)).toEqual([0, 123]);
  });

  it("resolves project tags through posted_journal_id when legacy source_id is null", () => {
    const input = cashInputFixture();
    input.journals[0]!.sourceId = null;
    input.documentJournalLinks = [
      {
        documentId: "invoice",
        companyId: testCompany,
        journalId: "invoice-journal",
        sourceType: "sales_invoice",
      },
    ];
    const rows = cashProjectProfitability(input, projects, [invoice("a", 10000n)], [], {
      from: "2026-11-01",
      to: "2026-11-30",
    });
    expect(rows[0]!.revenueMinor).toBe(5000);
  });

  it("rejects a project tag outside the selected company", () => {
    expect(() => run("2026-11-01", "2026-11-30", [invoice("foreign", 10000n)])).toThrow(
      "does not belong to the selected company",
    );
  });
});

it("never removes a project penny when another positive receipt arrives", () => {
  const input = cashInputFixture();
  input.journals[0]!.lines = [
    { accountId: arId, debit: 9n, credit: 0n },
    { accountId: revenueId, debit: 0n, credit: 9n },
  ];
  input.journals[2]!.lines = [
    { accountId: bankId, debit: 4n, credit: 0n },
    { accountId: arId, debit: 0n, credit: 4n },
  ];
  input.payments[0]!.amount = 4n;
  input.allocations[0]!.amount = 4n;
  input.journals.push({
    ...input.journals[2]!,
    id: "receipt-second",
    date: "2026-12-01",
    sourceId: "second",
    lines: [
      { accountId: bankId, debit: 1n, credit: 0n },
      { accountId: arId, debit: 0n, credit: 1n },
    ],
  });
  input.payments.push({
    ...input.payments[0]!,
    id: "second",
    journalId: "receipt-second",
    amount: 1n,
  });
  input.allocations.push({
    ...input.allocations[0]!,
    id: "second-allocation",
    paymentId: "second",
    amount: 1n,
  });
  const lines = [invoice("a", 5n), invoice("b", 3n), invoice(null, 1n)];
  const november = cashProjectProfitability(input, projects, lines, [], {
    from: "2026-11-01",
    to: "2026-11-30",
  });
  const december = cashProjectProfitability(input, projects, lines, [], {
    from: "2026-12-01",
    to: "2026-12-31",
  });
  const combined = cashProjectProfitability(input, projects, lines, [], {
    from: "2026-11-01",
    to: "2026-12-31",
  });
  expect(december.every((row) => row.revenueMinor >= 0)).toBe(true);
  expect(november.map((row, index) => row.revenueMinor + december[index]!.revenueMinor)).toEqual(
    combined.map((row) => row.revenueMinor),
  );
});
