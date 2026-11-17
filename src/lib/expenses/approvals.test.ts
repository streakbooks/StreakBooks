import { describe, expect, it } from "vitest";
import { approvalActionTarget, approvalNoteRequired, canPerformApprovalAction } from "./approvals";

describe("expense approval actions", () => {
  it("maps actions onto status targets", () => {
    expect(approvalActionTarget("start_review")).toBe("in_review");
    expect(approvalActionTarget("approve")).toBe("approved");
    expect(approvalActionTarget("return")).toBe("returned");
    expect(approvalActionTarget("reject")).toBe("rejected");
  });

  it("allows decisions from submitted and in_review only where transitions say so", () => {
    expect(canPerformApprovalAction("submitted", "approve")).toBe(true);
    expect(canPerformApprovalAction("in_review", "return")).toBe(true);
    expect(canPerformApprovalAction("draft", "approve")).toBe(false);
    expect(canPerformApprovalAction("approved", "reject")).toBe(false);
  });

  it("requires notes for return and reject", () => {
    expect(approvalNoteRequired("return")).toBe(true);
    expect(approvalNoteRequired("reject")).toBe(true);
    expect(approvalNoteRequired("approve")).toBe(false);
    expect(approvalNoteRequired("start_review")).toBe(false);
  });
});
