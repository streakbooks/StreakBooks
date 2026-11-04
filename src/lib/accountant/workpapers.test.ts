import { describe, expect, it } from "vitest";
import {
  signedWorkpaperLedger,
  workpaperReviewState,
  type AccountWorkpaper,
} from "./workpapers";

const row: AccountWorkpaper = {
  id: "00000000-0000-4000-8000-000000000001",
  company_id: "00000000-0000-4000-8000-000000000002",
  account_id: "00000000-0000-4000-8000-000000000003",
  as_of: "2026-10-31",
  gl_balance_minor: -12000,
  supporting_balance_minor: -12000,
  evidence_reference: "BANK-2026-10",
  note: "Closing statement reconciles",
  status: "reviewed",
  prepared_by: "u1",
  reviewed_by: "u2",
  prepared_at: "2026-11-03T08:00:00Z",
  reviewed_at: "2026-11-04T08:00:00Z",
  version: 3,
};

describe("accountant workpaper evidence", () => {
  it("uses signed debit less credit without rounding or precision loss", () => {
    expect(signedWorkpaperLedger(0, 12000)).toBe(-12000);
    expect(signedWorkpaperLedger(8000, 2500)).toBe(5500);
    expect(() => signedWorkpaperLedger(Number.MAX_SAFE_INTEGER, -1)).toThrow(
      "safe integer",
    );
    expect(() => signedWorkpaperLedger(1.5, 0)).toThrow("safe integer");
  });

  it("never presents an absent or stale review as approved", () => {
    expect(workpaperReviewState(undefined, 0)).toBe("not_started");
    expect(workpaperReviewState(row, -11999)).toBe("stale");
    expect(workpaperReviewState(row, -12000)).toBe("reviewed");
  });

  it("flags missing or mismatched evidence before showing saved status", () => {
    expect(
      workpaperReviewState({ ...row, supporting_balance_minor: null }, -12000),
    ).toBe("missing_evidence");
    expect(
      workpaperReviewState({ ...row, supporting_balance_minor: 12000 }, -12000),
    ).toBe("difference");
    expect(workpaperReviewState({ ...row, status: "prepared" }, -12000)).toBe(
      "prepared",
    );
  });
});
