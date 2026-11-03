import { describe, expect, it } from "vitest";
import { shouldIncludeLedgerAccount } from "./account-scope";

describe("General Ledger account inclusion", () => {
  it("includes every account, including zero balances, only when all is selected", () => {
    expect(shouldIncludeLedgerAccount("all", 0, 0n)).toBe(true);
    expect(shouldIncludeLedgerAccount("balance", 0, 0n)).toBe(false);
    expect(shouldIncludeLedgerAccount("transactions", 0, 0n)).toBe(false);
  });
  it("includes posted movements independently of opening balances", () => {
    for (const scope of ["all", "balance", "transactions"] as const) {
      expect(shouldIncludeLedgerAccount(scope, 1, 0n)).toBe(true);
    }
  });
  it("does not confuse an opening balance with a period transaction", () => {
    expect(shouldIncludeLedgerAccount("balance", 0, -2500n)).toBe(true);
    expect(shouldIncludeLedgerAccount("transactions", 0, -2500n)).toBe(false);
  });
});
