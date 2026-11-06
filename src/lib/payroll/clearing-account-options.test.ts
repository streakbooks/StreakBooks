import { describe, expect, it } from "vitest";
import { filterPayrollClearingAccounts, type PayrollClearingCandidate } from "./clearing-account-options";

const bankGl = (id: string, currency_code: string | null = null): PayrollClearingCandidate => ({
  id, code: id.toUpperCase(), name: id,
  account_type: "asset", is_active: true, is_postable: true,
  account_kind: "bank", currency_code,
});

describe("Payroll account currency selection", () => {
  it("includes base-currency and unmarked GL bank accounts", () => {
    const result = filterPayrollClearingAccounts(
      [bankGl("gbp", "GBP"), bankGl("default")], [], "GBP",
    );
    expect(result.accounts.map((a) => a.id)).toEqual(["gbp", "default"]);
    expect(result.excluded).toBe(0);
  });

  it("hides a GL account with a foreign override", () => {
    expect(filterPayrollClearingAccounts(
      [bankGl("foreign", "USD")], [], "GBP",
    )).toEqual({ accounts: [], excluded: 1 });
  });

  it("hides a bank-linked GL when the active bank uses another currency", () => {
    expect(filterPayrollClearingAccounts(
      [bankGl("a")],
      [{ gl_account_id: "a", currency_code: "USD", is_active: true }], "GBP",
    )).toEqual({ accounts: [], excluded: 1 });
  });

  it("rejects conflicting active bank currencies for the same GL", () => {
    const result = filterPayrollClearingAccounts(
      [bankGl("a")],
      [{ gl_account_id: "a", currency_code: "GBP", is_active: true },
       { gl_account_id: "a", currency_code: "USD", is_active: true }], "GBP",
    );
    expect(result.accounts).toHaveLength(0);
    expect(result.excluded).toBe(1);
  });

  it("does not penalize inactive linked banks", () => {
    const result = filterPayrollClearingAccounts(
      [bankGl("a")],
      [{ gl_account_id: "a", currency_code: "USD", is_active: false }], "GBP",
    );
    expect(result.accounts).toHaveLength(1);
  });

  it("recognises a bank-backed GL account that is typed as a current asset", () => {
    const result = filterPayrollClearingAccounts(
      [{ ...bankGl("linked"), account_kind: "current_asset" }],
      [{ gl_account_id: "linked", currency_code: "GBP", is_active: true }], "GBP",
    );
    expect(result.accounts.map((a) => a.id)).toEqual(["linked"]);
  });

  it("fails closed when an active linked bank currency is blank", () => {
    const result = filterPayrollClearingAccounts(
      [bankGl("unknown")],
      [{ gl_account_id: "unknown", currency_code: "", is_active: true }], "GBP",
    );
    expect(result.accounts).toHaveLength(0);
    expect(result.excluded).toBe(1);
  });

  it("never selects archived GL accounts", () => {
    const result = filterPayrollClearingAccounts(
      [{ ...bankGl("archived"), archived_at: "2026-01-01T00:00:00Z" }], [], "GBP",
    );
    expect(result.accounts).toHaveLength(0);
  });

  it("only presents eligible active postable bank/cash asset accounts", () => {
    const asset = { ...bankGl("other"), account_kind: "accounts_receivable" };
    const inactive = { ...bankGl("inactive"), is_active: false };
    const nonpostable = { ...bankGl("header"), is_postable: false };
    const result = filterPayrollClearingAccounts(
      [bankGl("cash"), asset, inactive, nonpostable], [], "GBP",
    );
    expect(result.accounts.map((a) => a.id)).toEqual(["cash"]);
    expect(result.excluded).toBe(0);
  });
});
