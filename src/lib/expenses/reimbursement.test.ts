import { describe, expect, it } from "vitest";
import {
  buildReimbursementJournalLines,
  canReimburseClaim,
  formatBatchReimburseSummary,
  mapBatchReimburseResult,
} from "./reimbursement";

describe("expense claim reimbursement", () => {
  it("allows posted eligible employee-paid claims", () => {
    expect(
      canReimburseClaim({
        approvalStatus: "approved",
        postingStatus: "posted",
        paymentSource: "employee_paid",
        reimbursementStatus: "awaiting_payment",
        postedJournalId: "j1",
        reimbursableMinor: 1100,
      }).ok,
    ).toBe(true);
  });

  it("allows remaining balance on partially paid claims", () => {
    expect(
      canReimburseClaim({
        approvalStatus: "approved",
        postingStatus: "posted",
        paymentSource: "employee_paid",
        reimbursementStatus: "partially_paid",
        postedJournalId: "j1",
        reimbursableMinor: 1100,
        reimbursedMinor: 400,
      }).ok,
    ).toBe(true);
  });

  it("blocks reimbursement before accrual", () => {
    expect(
      canReimburseClaim({
        approvalStatus: "approved",
        postingStatus: "ready",
        paymentSource: "employee_paid",
        reimbursementStatus: "eligible",
        postedJournalId: null,
        reimbursableMinor: 1100,
      }).ok,
    ).toBe(false);
  });

  it("builds DR payable CR bank lines", () => {
    const result = buildReimbursementJournalLines({
      payableAccountId: "payable",
      bankAccountId: "bank",
      amountMinor: 1100,
      claimNumber: "EXP-0001",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]?.debitMinor).toBe(1100);
    expect(result.lines[1]?.creditMinor).toBe(1100);
  });

  it("maps and summarises batch reimbursement results", () => {
    const mapped = mapBatchReimburseResult({
      paid_count: 2,
      failed_count: 1,
      results: [
        { claim_id: "c1", ok: true, claim_number: "EXP-1" },
        { claim_id: "c2", ok: false, error: "Already paid" },
      ],
    });
    expect(mapped.paidCount).toBe(2);
    expect(formatBatchReimburseSummary(mapped)).toContain("failed");
  });
});
