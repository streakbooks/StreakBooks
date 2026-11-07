import { describe, expect, it } from "vitest";
import { buildReimbursementJournalLines, canReimburseClaim } from "./reimbursement";

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
});
