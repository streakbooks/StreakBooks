import { describe, expect, it } from "vitest";
import {
  assertLedgerOnlyReviewable,
  isLedgerOnlyReviewTruncated,
  LEDGER_ONLY_REVIEW_CAP,
} from "@/lib/banking/recon-complete-guards";

describe("ledger-only truncate gate", () => {
  it("is false at and below the review cap", () => {
    expect(isLedgerOnlyReviewTruncated(0)).toBe(false);
    expect(isLedgerOnlyReviewTruncated(LEDGER_ONLY_REVIEW_CAP)).toBe(false);
  });

  it("is true above the review cap", () => {
    expect(isLedgerOnlyReviewTruncated(LEDGER_ONLY_REVIEW_CAP + 1)).toBe(true);
  });

  it("assert throws when truncated", () => {
    expect(() => assertLedgerOnlyReviewable(LEDGER_ONLY_REVIEW_CAP + 1)).toThrow(/Narrow the statement date/i);
    expect(() => assertLedgerOnlyReviewable(LEDGER_ONLY_REVIEW_CAP)).not.toThrow();
  });
});
