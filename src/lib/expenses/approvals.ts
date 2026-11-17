import type { ExpenseApprovalStatus } from "./types";
import { canTransitionApproval } from "./status";

export type ExpenseApprovalAction = "start_review" | "approve" | "return" | "reject";

export function approvalActionTarget(action: ExpenseApprovalAction): ExpenseApprovalStatus {
  switch (action) {
    case "start_review":
      return "in_review";
    case "approve":
      return "approved";
    case "return":
      return "returned";
    case "reject":
      return "rejected";
  }
}

export function canPerformApprovalAction(
  from: ExpenseApprovalStatus,
  action: ExpenseApprovalAction,
): boolean {
  return canTransitionApproval(from, approvalActionTarget(action));
}

export function approvalNoteRequired(action: ExpenseApprovalAction): boolean {
  return action === "return" || action === "reject";
}
