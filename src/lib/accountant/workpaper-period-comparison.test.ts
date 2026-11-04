import { describe, expect, it } from "vitest";
import { compareWorkpaperPeriods, type ComparedLedgerAccount } from "./workpaper-period-comparison";
import type { AccountWorkpaper } from "./workpapers";

const account = (id: string, debit: number, credit: number): ComparedLedgerAccount => ({
  account_id: id,
  code: id,
  name: "Account " + id,
  account_type: "asset",
  debit_minor: debit,
  credit_minor: credit,
});

const paper = (
  accountId: string,
  gl: number,
  status: AccountWorkpaper["status"] = "reviewed",
): AccountWorkpaper => ({
  id: "wp-" + accountId,
  company_id: "test-company",
  account_id: accountId,
  as_of: "2026-10-31",
  gl_balance_minor: gl,
  supporting_balance_minor: gl,
  evidence_reference: "BANK-STATEMENT-2026-10",
  note: "Evidence retained separately",
  status,
  prepared_by: "preparer",
  reviewed_by: status === "reviewed" ? "reviewer" : null,
  prepared_at: "2026-11-02T10:00:00Z",
  reviewed_at: status === "reviewed" ? "2026-11-03T10:00:00Z" : null,
  version: 2,
});

describe("cross-period accountant workpaper comparison", () => {
  it("calculates changes in signed base-currency minor units, including liabilities", () => {
    const result = compareWorkpaperPeriods(
      [account("100", 8000, 0), { ...account("200", 0, 12000), account_type: "liability" }],
      [account("100", 5000, 0), { ...account("200", 0, 9000), account_type: "liability" }],
      [],
      [],
    );
    expect(
      result.map((row) => [row.accountId, row.currentMinor, row.previousMinor, row.movementMinor]),
    ).toEqual([
      ["100", 8000, 5000, 3000],
      ["200", -12000, -9000, -3000],
    ]);
  });

  it("preserves review history but never carries approval into the new period", () => {
    const result = compareWorkpaperPeriods(
      [account("100", 2000, 0)],
      [account("100", 1000, 0)],
      [],
      [paper("100", 1000)],
    );
    expect(result[0]).toMatchObject({
      previousState: "reviewed",
      currentState: "not_started",
      movementMinor: 1000,
      requiresInvestigation: true,
      previousEvidenceReference: "BANK-STATEMENT-2026-10",
      currentEvidenceReference: null,
    });
  });

  it("shows stale prior approval if historical posted ledger changed", () => {
    const result = compareWorkpaperPeriods(
      [account("100", 3500, 0)],
      [account("100", 3400, 0)],
      [paper("100", 3500)],
      [paper("100", 3000)],
    );
    expect(result[0]).toMatchObject({
      currentState: "reviewed",
      previousState: "stale",
      movementMinor: 100,
      requiresInvestigation: true,
    });
  });

  it("does not fabricate a previous balance when an account is absent", () => {
    const result = compareWorkpaperPeriods([account("NEW", 2000, 0)], [], [], []);
    expect(result[0]).toMatchObject({
      previousMinor: null,
      movementMinor: null,
      previousState: "not_available",
      requiresInvestigation: true,
    });
  });

  it("returns null movement instead of rounding unsafe balances or differences", () => {
    const result = compareWorkpaperPeriods(
      [account("MAX", Number.MAX_SAFE_INTEGER, 0), account("UNSAFE", Number.MAX_SAFE_INTEGER, -1)],
      [account("MAX", 0, Number.MAX_SAFE_INTEGER), account("UNSAFE", 0.25, 0)],
      [],
      [],
    );
    expect(result.find((row) => row.accountId === "MAX")).toMatchObject({
      movementMinor: null,
      currentMinor: Number.MAX_SAFE_INTEGER,
      previousMinor: -Number.MAX_SAFE_INTEGER,
    });
    expect(result.find((row) => row.accountId === "UNSAFE")).toMatchObject({
      movementMinor: null,
      currentMinor: null,
      previousMinor: null,
      currentState: "unsafe",
      previousState: "unsafe",
    });
  });

  it("marks an unchanged, independently reviewed balance as not requiring investigation", () => {
    const result = compareWorkpaperPeriods(
      [account("100", 4500, 0)],
      [account("100", 4500, 0)],
      [paper("100", 4500)],
      [paper("100", 4500)],
    );
    expect(result[0]).toMatchObject({
      movementMinor: 0,
      previousState: "reviewed",
      currentState: "reviewed",
      requiresInvestigation: false,
    });
  });

  it("ignores P&L accounts and sorts by absolute movement, then code", () => {
    const result = compareWorkpaperPeriods(
      [
        account("B", 300, 0),
        { ...account("EXP", 200, 0), account_type: "expense" },
        account("A", 500, 0),
      ],
      [account("B", 200, 0), account("A", 0, 0)],
      [],
      [],
    );
    expect(result.map((row) => row.accountId)).toEqual(["A", "B"]);
  });
});
