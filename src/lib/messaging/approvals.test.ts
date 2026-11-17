import { describe, expect, it } from "vitest";
import {
  buildMessagingApprovalEventKey,
  looksLikeInformalApproval,
  messagingApprovalTargetPath,
} from "./approvals";

describe("messaging approval handoff", () => {
  it("builds stable event keys", () => {
    const key = buildMessagingApprovalEventKey({
      kind: "bill_approval",
      companyId: "c",
      conversationId: "conv",
      recordType: "purchase_bill",
      recordId: "bill",
      assigneeUserId: "user",
      note: "Please review",
    });
    expect(key).toContain("messaging-approval");
    expect(key).toContain("bill_approval");
  });

  it("never treats chat slang as formal approval", () => {
    expect(looksLikeInformalApproval("approved")).toBe(true);
    expect(looksLikeInformalApproval("Please approve this bill tomorrow")).toBe(false);
  });

  it("deep-links back to the conversation", () => {
    expect(
      messagingApprovalTargetPath({
        kind: "task_assignment",
        companyId: "c",
        conversationId: "550e8400-e29b-41d4-a716-446655440000",
        recordType: "task",
        recordId: "t",
        assigneeUserId: "u",
        note: "x",
      }),
    ).toContain("/messages?conversation=");
  });
});
