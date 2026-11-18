/** Budget approval actions and presentation rules. Server validates again in the SQL RPC. */
export type BudgetApprovalAction = "submit" | "withdraw" | "approve" | "reject" | "reopen";
export type BudgetApprovalStatus =
  "draft" | "pending" | "approved" | "rejected" | "withdrawn" | "reopened";

export const APPROVAL_STATUS_LABELS: Record<BudgetApprovalStatus, string> = {
  draft: "Draft",
  pending: "Pending approval",
  approved: "Approved",
  rejected: "Changes requested",
  withdrawn: "Withdrawn",
  reopened: "Reopened for revision",
};

export function validateBudgetApprovalAction(input: { action: unknown; note: unknown }): {
  action: BudgetApprovalAction;
  note: string;
} {
  if (
    input.action !== "submit" &&
    input.action !== "withdraw" &&
    input.action !== "approve" &&
    input.action !== "reject" &&
    input.action !== "reopen"
  ) {
    throw new Error("Choose a valid budget approval action.");
  }
  if (typeof input.note !== "string") {
    throw new Error("Enter an approval note between 3 and 500 characters.");
  }
  const note = input.note.trim();
  if (note.length < 3 || note.length > 500) {
    throw new Error("Enter an approval note between 3 and 500 characters.");
  }
  return { action: input.action, note };
}

export function availableBudgetApprovalActions(input: {
  status: BudgetApprovalStatus;
  isRequester: boolean;
  canManage: boolean;
  hasAmounts: boolean;
  manuallyLocked: boolean;
}): BudgetApprovalAction[] {
  if (!input.canManage) return [];
  if (input.status === "pending") {
    return input.isRequester ? ["withdraw"] : ["approve", "reject"];
  }
  if (input.status === "approved") return ["reopen"];
  if (!input.hasAmounts || input.manuallyLocked) return [];
  return ["submit"];
}
