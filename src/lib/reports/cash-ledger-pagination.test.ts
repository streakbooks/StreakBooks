import { describe, expect, it } from "vitest";
import type { CashPnlEntry } from "./cash-profit-loss";
import { buildCashGeneralLedger } from "./cash-general-ledger";
import { paginateCashGeneralLedger } from "./cash-ledger-pagination";

const bank = "11111111-1111-4111-8111-111111111111";
const sales = "22222222-2222-4222-8222-222222222222";
const noActivity = "33333333-3333-4333-8333-333333333333";
const accounts = [
  { id: bank, code: "1000", name: "Zenith Bank", account_type: "asset" as const },
  { id: sales, code: "4000", name: "Alpha Sales", account_type: "income" as const },
  { id: noActivity, code: "9000", name: "Unused", account_type: "expense" as const },
];
function cashEntry(accountId: string, n: number): CashPnlEntry {
  const journalId = String(n).padStart(8, "0");
  return {
    accountId,
    date: "2026-04-15",
    journalId,
    journalNumber: journalId,
    sourceJournalId: journalId,
    sourceType: "sales_receipt",
    sourceId: null,
    debit: accountId === bank ? 125n : 0n,
    credit: accountId === sales ? 125n : 0n,
    reason: "settlement",
  };
}
const entries = Array.from({ length: 1201 }, (_, n) => [
  cashEntry(bank, n + 1),
  cashEntry(sales, n + 1),
]).flat();
const report = buildCashGeneralLedger({
  accounts,
  entries,
  from: "2026-04-01",
  to: "2026-04-30",
  accountScope: "all",
});

describe("cash ledger global pagination", () => {
  it("pages beyond 2,000 recognized movements with no gaps or duplicated entries", () => {
    expect(report.lineCount).toBe(2402);
    const count = report.lineCount + report.accounts.length;
    const pages = Array.from({ length: Math.ceil(count / 100) }, (_, page) =>
      paginateCashGeneralLedger(report, { page, pageSize: 100 }),
    );
    expect(pages[0]?.totalCount).toBe(2405);
    expect(
      pages.every((p) => p.accounts.reduce((sum, a) => sum + a.rows.length + 1, 0) <= 102),
    ).toBe(true);
    expect(pages.reduce((sum, p) => sum + p.lineCount, 0)).toBe(2402);
    const expected = report.accounts.flatMap((a) =>
      a.rows.map((r) => [a.account.id, r.journal_id]),
    );
    const actual = pages.flatMap((p) =>
      p.accounts.flatMap((a) => a.rows.map((row) => [a.account.id, row.journal_id])),
    );
    expect(actual).toEqual(expected);
    expect(pages.at(-1)?.totalLineCount).toBe(2402);
    expect(report.accounts.map((a) => a.rows.length)).toEqual([1201, 1201, 0]);
  });

  it("preserves full-period balances, even on middle pages", () => {
    const full = report.accounts[0]!;
    const middle = paginateCashGeneralLedger(report, { page: 4, pageSize: 100 });
    const group = middle.accounts.find((a) => a.account.id === bank)!;
    expect(group.opening_balance_minor).toBe(full.opening_balance_minor);
    expect(group.closing_balance_minor).toBe(full.closing_balance_minor);
    expect(group.rows[0]?.running_balance_minor).toBe(full.rows[399]?.running_balance_minor);
    expect(group.rows[0]?.running_balance_minor).not.toBe(group.rows[0]?.debit_minor);
  });

  it("supports grouping by account name and retains no-activity accounts", () => {
    const first = paginateCashGeneralLedger(report, { page: 0, pageSize: 25, groupBy: "name" });
    expect(first.accounts[0]?.account.id).toBe(sales);
    const last = paginateCashGeneralLedger(report, {
      page: Math.floor((report.lineCount + report.accounts.length - 1) / 25),
      pageSize: 25,
      groupBy: "name",
    });
    expect(last.accounts.some((a) => a.account.id === noActivity)).toBe(false);
    const allPages = Array.from(
      { length: Math.ceil((report.lineCount + report.accounts.length) / 25) },
      (_, page) => paginateCashGeneralLedger(report, { page, pageSize: 25, groupBy: "name" }),
    );
    expect(allPages.some((p) => p.accounts.some((a) => a.account.id === noActivity))).toBe(true);
  });

  it("fails closed on an invalid page, without returning an unrelated page", () => {
    expect(() => paginateCashGeneralLedger(report, { page: -1, pageSize: 100 })).toThrow("Invalid");
    expect(() => paginateCashGeneralLedger(report, { page: 99, pageSize: 100 })).toThrow("outside");
  });
});
