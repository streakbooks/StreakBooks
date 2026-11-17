import { describe, expect, it } from "vitest";
import {
  assertApprovalTransition,
  canTransitionApproval,
  canTransitionPosting,
  canTransitionReimbursement,
  isPaidReimbursementStatus,
  statusesAfterApproval,
} from "./status";

describe("expense status machines", () => {
  it("allows draft submit and blocks silent edits after approval", () => {
    expect(canTransitionApproval("draft", "submitted")).toBe(true);
    expect(canTransitionApproval("approved", "draft")).toBe(false);
    expect(canTransitionApproval("approved", "voided")).toBe(true);
  });

  it("keeps posting separate from approval", () => {
    expect(canTransitionPosting("not_posted", "ready")).toBe(true);
    expect(canTransitionPosting("ready", "posted")).toBe(false);
    expect(canTransitionPosting("posting", "posted")).toBe(true);
  });

  it("does not treat payout initiation as paid", () => {
    expect(canTransitionReimbursement("awaiting_payment", "payment_initiated")).toBe(true);
    expect(isPaidReimbursementStatus("payment_initiated")).toBe(false);
    expect(isPaidReimbursementStatus("paid")).toBe(true);
  });

  it("marks employee-paid claims eligible after approval", () => {
    expect(statusesAfterApproval("employee_paid")).toEqual({
      approvalStatus: "approved",
      postingStatus: "ready",
      reimbursementStatus: "eligible",
    });
    expect(statusesAfterApproval("corporate_card").reimbursementStatus).toBe("not_eligible");
  });

  it("throws on invalid approval transitions", () => {
    expect(() => assertApprovalTransition("voided", "submitted")).toThrow(
      /Invalid expense approval/,
    );
  });
});
