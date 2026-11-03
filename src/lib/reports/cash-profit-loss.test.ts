import { describe, expect, it } from "vitest";
import { cashProfitLoss, type CashJournal } from "./cash-profit-loss";
import { cashInputFixture, arId, apId, taxId } from "./__fixtures__/cash-facts";
import { bankId, revenueId, expenseId, testCompany } from "./__fixtures__/facts";
const period = { from: "2026-11-01", to: "2026-11-30" };
const totals = (input = cashInputFixture(), dates = period) =>
  cashProfitLoss(input, dates).reduce(
    (sum, row) => ({
      revenue: sum.revenue + (row.accountId === revenueId ? row.credit - row.debit : 0n),
      expense: sum.expense + (row.accountId === expenseId ? row.debit - row.credit : 0n),
    }),
    { revenue: 0n, expense: 0n },
  );
const journal = (
  id: string,
  date: string,
  sourceType: string,
  lines: Array<[string, bigint, bigint]>,
): CashJournal => ({
  id,
  companyId: testCompany,
  date,
  number: id,
  sourceType,
  sourceId: id,
  currency: "GBP",
  rate: "1",
  reverses: null,
  lines: lines.map(([accountId, debit, credit]) => ({ accountId, debit, credit })),
});

describe("cash-basis Profit and Loss engine", () => {
  it("recognizes partial invoice receipts and bill payments on the cash date, excluding VAT and unpaid balances", () => {
    expect(totals()).toEqual({ revenue: 5000n, expense: 4000n });
    expect(totals(cashInputFixture(), { from: "2026-10-01", to: "2026-10-31" })).toEqual({
      revenue: 0n,
      expense: 0n,
    });
    const input = cashInputFixture();
    expect(cashProfitLoss(input, period).map((row) => row.journalId)).toEqual([
      "receipt-journal",
      "payment-journal",
    ]);
    expect(input.journals[0]!.lines[1]!.credit).toBe(10000n);
  });
  it("includes directly paid expenses and cash income, but excludes transfers, loans and noncash depreciation/revaluation", () => {
    const input = cashInputFixture();
    input.journals.push(
      journal("expense", "2026-11-04", "expense", [
        [expenseId, 1000n, 0n],
        [bankId, 0n, 1000n],
      ]),
      journal("cash-sale", "2026-11-04", "bank_transaction", [
        [bankId, 2000n, 0n],
        [revenueId, 0n, 2000n],
      ]),
      journal("loan", "2026-11-04", "manual", [
        [bankId, 10000n, 0n],
        [taxId, 0n, 10000n],
      ]),
      journal("depreciation", "2026-11-04", "depreciation", [
        [expenseId, 500n, 0n],
        [taxId, 0n, 500n],
      ]),
      journal("revaluation", "2026-11-04", "fx_revaluation", [
        [bankId, 100n, 0n],
        [revenueId, 0n, 100n],
      ]),
    );
    expect(totals(input)).toEqual({ revenue: 7000n, expense: 5000n });
  });
  it("does not recognize noncash credit notes without an actual cash refund", () => {
    const input = cashInputFixture();
    input.journals.push(
      journal("credit", "2026-11-05", "sales_credit_note", [
        [revenueId, 2000n, 0n],
        [taxId, 400n, 0n],
        [arId, 0n, 2400n],
      ]),
    );
    expect(totals(input)).toEqual({ revenue: 5000n, expense: 4000n });
  });
  it("recognizes a credit-note cash refund on its posted cash date and excludes tax", () => {
    const input = cashInputFixture();
    input.journals.push(
      journal("credit", "2026-11-05", "sales_credit_note", [
        [revenueId, 2000n, 0n],
        [taxId, 400n, 0n],
        [arId, 0n, 2400n],
      ]),
      journal("refund", "2026-11-06", "other", [
        [arId, 2400n, 0n],
        [bankId, 0n, 2400n],
      ]),
    );
    input.refunds.push({
      id: "refund",
      companyId: testCompany,
      side: "income",
      journalId: "refund",
      voidJournalId: null,
      currency: "GBP",
      rate: "1",
      amount: 2400n,
      uses: [{ id: "use", kind: "sales_credit_note", documentId: "credit", amount: 2400n }],
    });
    expect(totals(input)).toEqual({ revenue: 3000n, expense: 4000n });
  });
  it("retains the original cash recognition and reverses it in the actual void month", () => {
    const input = cashInputFixture();
    const reversal = journal("receipt-void", "2026-12-01", "reversal", [
      [arId, 6000n, 0n],
      [bankId, 0n, 6000n],
    ]);
    reversal.reverses = "receipt-journal";
    input.journals.push(reversal);
    input.payments[0]!.voidJournalId = reversal.id;
    input.allocations[0]!.reversedOn = reversal.date;
    expect(totals(input)).toEqual({ revenue: 5000n, expense: 4000n });
    expect(totals(input, { from: "2026-12-01", to: "2026-12-31" })).toEqual({
      revenue: -5000n,
      expense: 0n,
    });
  });
  it("uses the settlement FX rate instead of the invoice's rate and avoids counting realized FX twice", () => {
    const input = cashInputFixture();
    input.journals[0]!.currency = "EUR";
    input.journals[0]!.rate = "1.1";
    input.journals[2]!.currency = "EUR";
    input.journals[2]!.rate = "1.2";
    input.payments[0]!.currency = "EUR";
    input.payments[0]!.rate = "1.2";
    expect(totals(input)).toEqual({ revenue: 6000n, expense: 4000n });
  });
  it("preserves exact amounts above Number precision", () => {
    const input = cashInputFixture();
    const huge = 900719925474099301n;
    input.journals.push(
      journal("huge", "2026-11-30", "bank_transaction", [
        [bankId, huge, 0n],
        [revenueId, 0n, huge],
      ]),
    );
    expect(totals(input).revenue).toBe(huge + 5000n);
  });
  it.each(["missing allocations", "cross company", "bank mismatch", "unbalanced", "invalid date"])(
    "fails closed for %s",
    (kind) => {
      const input = cashInputFixture();
      if (kind === "missing allocations") input.allocations.pop();
      if (kind === "cross company") input.payments[0]!.companyId = "other";
      if (kind === "bank mismatch") input.payments[0]!.amount = 6001n;
      if (kind === "unbalanced") input.journals[0]!.lines[0]!.debit++;
      if (kind === "invalid date") input.journals[0]!.date = "2026-02-30";
      expect(() => cashProfitLoss(input, period)).toThrow();
    },
  );
  it("does not silently classify bank movements against control accounts with no allocation provenance", () => {
    const input = cashInputFixture();
    input.journals.push(
      journal("unknown", "2026-11-20", "manual", [
        [bankId, 100n, 0n],
        [apId, 0n, 100n],
      ]),
    );
    expect(() => cashProfitLoss(input, period)).toThrow("without complete cash allocation");
  });
});

describe("gross cash movements with zero net bank change", () => {
  it("retains both direct cash revenue and expense rather than dropping the balanced pair", () => {
    const input = cashInputFixture();
    input.journals.push(
      journal("offsetting-cash", "2026-11-10", "bank_transaction", [
        [bankId, 1000n, 0n],
        [revenueId, 0n, 1000n],
        [expenseId, 1000n, 0n],
        [bankId, 0n, 1000n],
      ]),
    );
    expect(totals(input)).toEqual({ revenue: 6000n, expense: 5000n });
  });
});

describe("FX rounding across multiple documents in one cash payment", () => {
  it("allocates the one base-currency penny once rather than independently inventing a penny per invoice", () => {
    const input = cashInputFixture();
    const first = journal("yen-invoice-1", "2026-10-01", "sales_invoice", [
      [arId, 1n, 0n],
      [revenueId, 0n, 1n],
    ]);
    const second = journal("yen-invoice-2", "2026-10-01", "sales_invoice", [
      [arId, 1n, 0n],
      [revenueId, 0n, 1n],
    ]);
    const cash = journal("yen-cash", "2026-11-01", "customer_payment", [
      [bankId, 2n, 0n],
      [arId, 0n, 2n],
    ]);
    for (const row of [first, second, cash]) {
      row.currency = "JPY";
      row.rate = "0.0067";
    }
    input.journals = [first, second, cash];
    input.payments = [
      {
        id: "yen-cash",
        companyId: testCompany,
        side: "income",
        journalId: cash.id,
        voidJournalId: null,
        currency: "JPY",
        rate: "0.0067",
        amount: 2n,
      },
    ];
    input.allocations = [first, second].map((row, index) => ({
      id: `allocation-${index}`,
      companyId: testCompany,
      paymentId: "yen-cash",
      documentId: row.sourceId!,
      amount: 1n,
      reversedOn: null,
    }));
    expect(totals(input)).toEqual({ revenue: 1n, expense: 0n });
  });
});

describe("verified cash reversal cancellation", () => {
  it("cancels an exact void pair within the reporting period without inventing deleted AP allocation history", () => {
    const input = cashInputFixture();
    const voided = journal("payment-void", "2026-11-20", "reversal", [
      [bankId, 4800n, 0n],
      [apId, 0n, 4800n],
    ]);
    voided.reverses = "payment-journal";
    input.journals.push(voided);
    input.payments[1]!.voidJournalId = voided.id;
    input.allocations = input.allocations.filter((row) => row.paymentId !== "payment");
    expect(totals(input)).toEqual({ revenue: 5000n, expense: 0n });
    expect(() => cashProfitLoss(input, { from: "2026-11-01", to: "2026-11-10" })).toThrow(
      "allocations are incomplete",
    );
  });
});

describe("noncash credit distribution", () => {
  it("permits proportional credits without recognizing them as cash and refuses changed tax/account mixes", () => {
    const input = cashInputFixture();
    input.journals.push(
      journal("linked-credit", "2026-10-20", "sales_credit_note", [
        [revenueId, 2000n, 0n],
        [taxId, 400n, 0n],
        [arId, 0n, 2400n],
      ]),
    );
    input.creditAllocations = [
      {
        documentId: "invoice",
        creditId: "linked-credit",
        allocatedOn: "2026-10-20",
        reversedOn: null,
      },
    ];
    expect(totals(input)).toEqual({ revenue: 5000n, expense: 4000n });
    input.journals[input.journals.length - 1]!.lines = [
      { accountId: revenueId, debit: 2400n, credit: 0n },
      { accountId: arId, debit: 0n, credit: 2400n },
    ];
    expect(() => totals(input)).toThrow("non-proportional credit");
  });
});

describe("cash capture consistency", () => {
  it("fails explicitly if a posted settlement header has no visible posted journal", () => {
    const input = cashInputFixture();
    input.journals = input.journals.filter((row) => row.id !== "receipt-journal");
    expect(() => totals(input)).toThrow("posted cash settlement journal is unavailable");
  });
});

describe("unsupported accrual bridges", () => {
  it.each(["inventory", "prepayment", "deferred_revenue"])(
    "never silently drops a paid %s account from cash P&L",
    (kind) => {
      const input = cashInputFixture();
      const account = input.accounts.find((row) => row.id === expenseId)!;
      account.account_kind = kind;
      account.account_type = "asset";
      expect(() => totals(input)).toThrow("cash-recognition policy");
    },
  );
});
