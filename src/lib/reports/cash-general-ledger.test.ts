import { describe, expect, it } from "vitest";
import type { CashPnlEntry } from "./cash-profit-loss";
import { buildCashGeneralLedger } from "./cash-general-ledger";

const cash = "11111111-1111-4111-8111-111111111111";
const sales = "22222222-2222-4222-8222-222222222222";
const accounts = [
  { id: cash, code: "1000", name: "Bank", account_type: "asset" as const },
  { id: sales, code: "4000", name: "Sales", account_type: "income" as const },
];
function entry(
  accountId: string,
  date: string,
  journalId: string,
  debit: bigint,
  credit: bigint,
): CashPnlEntry {
  return {
    accountId,
    date,
    journalId,
    journalNumber: journalId,
    sourceJournalId: journalId,
    sourceType: "sales_receipt",
    sourceId: null,
    debit,
    credit,
    reason: "settlement",
  };
}
const entries = [
  entry(cash, "2026-03-31", "1", 10000n, 0n),
  entry(sales, "2026-03-31", "1", 0n, 10000n),
  entry(cash, "2026-04-12", "2", 5000n, 0n),
  entry(sales, "2026-04-12", "2", 0n, 5000n),
];
const base = { accounts, entries, from: "2026-04-01", to: "2026-04-30" };
describe("management cash General Ledger", () => {
  it("retains preperiod opening balance and recognises only cash settlement movements", () => {
    const r = buildCashGeneralLedger({ ...base, accountScope: "balance", selectedIds: [sales] });
    expect(r.lineCount).toBe(1);
    expect(r.accounts[0]?.opening_balance_minor).toBe(10000);
    expect(r.accounts[0]?.rows[0]?.running_balance_minor).toBe(15000);
    expect(r.accounts[0]?.closing_balance_minor).toBe(15000);
    expect(r.accounts[0]?.rows[0]?.memo).toContain("Cash settlement");
  });
  it("does not treat opening balances as current-period transactions", () => {
    const r = buildCashGeneralLedger({
      ...base,
      to: "2026-04-10",
      accountScope: "transactions",
    });
    expect(r.accounts).toEqual([]);
    const balances = buildCashGeneralLedger({
      ...base,
      to: "2026-04-10",
      accountScope: "balance",
    });
    expect(balances.accounts).toHaveLength(2);
    expect(balances.lineCount).toBe(0);
  });
  it("preserves signed normal balances, with no source mutation", () => {
    const r = buildCashGeneralLedger({ ...base, accountScope: "all" });
    expect(r.accounts.map((a) => a.closing_balance_minor)).toEqual([15000, 15000]);
    expect(entries[0]?.debit).toBe(10000n);
    expect(r.accounts.map((a) => a.rows.length)).toEqual([1, 1]);
  });
  it("rejects foreign accounts, unsafe integers and malformed periods", () => {
    expect(() =>
      buildCashGeneralLedger({ ...base, accountScope: "all", selectedIds: ["foreign"] }),
    ).toThrow("not found");
    expect(() =>
      buildCashGeneralLedger({ ...base, from: "2026-05-01", accountScope: "all" }),
    ).toThrow("End date");
    expect(() =>
      buildCashGeneralLedger({
        ...base,
        entries: [entry(sales, "2026-04-01", "9", 0n, BigInt(Number.MAX_SAFE_INTEGER) + 1n)],
        accountScope: "balance",
      }),
    ).toThrow("safe numeric range");
  });
});
