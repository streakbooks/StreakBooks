import { describe, expect, it } from "vitest";
import {
  buildBalanceSheet,
  buildGeneralLedger,
  buildProfitAndLoss,
  buildTrialBalance,
} from "@/lib/accounting/reporting";
import { cashInputFixture } from "./__fixtures__/cash-facts";
import { bankId, expenseId, revenueId } from "./__fixtures__/facts";
import { cashProfitLoss, type CashPnlInput } from "./cash-profit-loss";
import { cashLedger } from "./cash-ledger";
import { cashEntriesToPostedLines } from "./cash-report";

const november = { from: "2026-11-01", to: "2026-11-30" };
const december = { from: "2026-12-01", to: "2026-12-31" };
const amount = (input: CashPnlInput, side: "income" | "expense", period = november) =>
  cashProfitLoss(input, period)
    .filter((entry) => entry.accountId === (side === "income" ? revenueId : expenseId))
    .reduce(
      (sum, entry) =>
        sum + (side === "income" ? entry.credit - entry.debit : entry.debit - entry.credit),
      0n,
    );
function settled(fraction: 0 | 1 | 2) {
  const input = cashInputFixture();
  if (fraction === 0) {
    input.journals = input.journals.slice(0, 2);
    input.payments = [];
    input.allocations = [];
  } else if (fraction === 2) {
    for (const payment of input.payments) payment.amount *= 2n;
    for (const allocation of input.allocations) allocation.amount *= 2n;
    for (const journal of input.journals.slice(2))
      for (const line of journal.lines) {
        line.debit *= 2n;
        line.credit *= 2n;
      }
  }
  return input;
}
function paidAcrossPeriods() {
  const input = cashInputFixture();
  for (const payment of [...input.payments]) {
    const original = input.journals.find((journal) => journal.id === payment.journalId)!;
    input.journals.push({
      ...original,
      id: `${original.id}:second`,
      date: "2026-12-05",
      number: "12",
      sourceId: `${payment.id}:second`,
    });
    input.payments.push({
      ...payment,
      id: `${payment.id}:second`,
      journalId: `${original.id}:second`,
    });
    const allocation = input.allocations.find((row) => row.paymentId === payment.id)!;
    input.allocations.push({
      ...allocation,
      id: `${allocation.id}:second`,
      paymentId: `${payment.id}:second`,
    });
  }
  return input;
}

describe("cash accounting end-to-end calculation acceptance", () => {
  it.each(["income", "expense"] as const)("unpaid %s documents recognize zero", (side) => {
    expect(amount(settled(0), side)).toBe(0n);
  });
  it.each([
    ["income", 5000n],
    ["expense", 4000n],
  ] as const)(
    "partially paid %s documents recognize their net allocated share",
    (side, expected) => {
      expect(amount(settled(1), side)).toBe(expected);
    },
  );
  it.each([
    ["income", 10000n],
    ["expense", 8000n],
  ] as const)("fully paid %s documents recognize exactly the source net", (side, expected) => {
    expect(amount(settled(2), side)).toBe(expected);
  });
  it.each([
    ["income", 5000n],
    ["expense", 4000n],
  ] as const)(
    "multiple %s settlements belong to each actual period and never count twice",
    (side, half) => {
      const input = paidAcrossPeriods();
      expect(amount(input, side, november)).toBe(half);
      expect(amount(input, side, december)).toBe(half);
      expect(amount(input, side, { from: november.from, to: december.to })).toBe(half * 2n);
      expect(amount(input, side, { from: "2026-10-01", to: "2026-10-31" })).toBe(0n);
    },
  );
  it("keeps customer and supplier advances outside income and expenses while the ledger balances", () => {
    const input = cashInputFixture();
    input.allocations = [];
    expect(cashProfitLoss(input, november)).toEqual([]);
    const ledger = cashLedger(input, november);
    expect(ledger.reduce((sum, row) => sum + row.debit - row.credit, 0n)).toBe(0n);
  });
  it("treats a bank transfer as zero income and expense", () => {
    const input = settled(0),
      second = "77777777-7777-4777-8777-777777777777";
    input.accounts.push({
      ...input.accounts.find((account) => account.id === bankId)!,
      id: second,
      code: "1010",
      name: "Second bank",
    });
    input.cashAccountIds.push(second);
    input.journals.push({
      ...input.journals[0]!,
      id: "transfer",
      sourceId: "transfer",
      sourceType: "bank_transfer",
      date: "2026-11-05",
      lines: [
        { accountId: bankId, debit: 0n, credit: 1000n },
        { accountId: second, debit: 1000n, credit: 0n },
      ],
    });
    expect(cashProfitLoss(input, november)).toEqual([]);
    expect(cashLedger(input, november).reduce((sum, row) => sum + row.debit - row.credit, 0n)).toBe(
      0n,
    );
  });
  it("recognizes processor receipt income once and only the fee again on settlement", () => {
    const input = cashInputFixture(),
      clearing = "88888888-8888-4888-8888-888888888888";
    input.accounts.push({
      ...input.accounts.find((account) => account.id === bankId)!,
      id: clearing,
      code: "1090",
      name: "Stripe clearing",
      system_key: "stripe_clearing",
    });
    input.cashAccountIds.push(clearing);
    input.journals[2]!.lines[0]!.accountId = clearing;
    input.journals.push({
      ...input.journals[2]!,
      id: "settlement",
      sourceId: "settlement",
      sourceType: "bank_deposit",
      date: "2026-11-06",
      lines: [
        { accountId: bankId, debit: 5900n, credit: 0n },
        { accountId: expenseId, debit: 100n, credit: 0n },
        { accountId: clearing, debit: 0n, credit: 6000n },
      ],
    });
    expect(amount(input, "income")).toBe(5000n);
    expect(amount(input, "expense")).toBe(4100n);
    expect(cashLedger(input, november).reduce((sum, row) => sum + row.debit - row.credit, 0n)).toBe(
      0n,
    );
  });
  it("reconciles cash P&L, Balance Sheet, Trial Balance and General Ledger through existing accounting builders", () => {
    const input = cashInputFixture();
    const lines = cashEntriesToPostedLines(
      input,
      cashLedger(input, { from: "0001-01-01", to: november.to }),
    );
    const pnl = buildProfitAndLoss(lines, november);
    expect(pnl.revenue).toBe(5000n);
    expect(pnl.expense).toBe(4000n);
    expect(pnl.net).toBe(1000n);
    expect(
      buildBalanceSheet(lines, { asOf: november.to, fyStart: "2026-01-01" }).equationHolds,
    ).toBe(true);
    const trial = buildTrialBalance(lines, { to: november.to });
    expect(trial.balances).toBe(true);
    expect(trial.totalDebit).toBe(trial.totalCredit);
    expect(
      buildGeneralLedger(lines, { accountId: revenueId, ...november }).reduce(
        (sum, line) => sum + BigInt(line.credit_minor) - BigInt(line.debit_minor),
        0n,
      ),
    ).toBe(pnl.revenue);
  });
  it("leaves the original posted accrual journal values and dates unchanged", () => {
    const input = paidAcrossPeriods();
    const original = structuredClone(input);
    cashLedger(input, { from: "0001-01-01", to: december.to });
    expect(input).toEqual(original);
    const accrualEntries = input.journals.flatMap((journal) =>
      journal.lines.map((line) => ({
        accountId: line.accountId,
        date: journal.date,
        journalId: journal.id,
        journalNumber: journal.number,
        sourceJournalId: journal.id,
        sourceType: journal.sourceType,
        sourceId: journal.sourceId,
        debit: line.debit,
        credit: line.credit,
        reason: "direct_cash" as const,
      })),
    );
    const accrual = cashEntriesToPostedLines(input, accrualEntries);
    expect(buildProfitAndLoss(accrual, { from: "2026-10-01", to: "2026-10-31" }).net).toBe(2000n);
    expect(buildProfitAndLoss(accrual, november).net).toBe(0n);
  });
});
