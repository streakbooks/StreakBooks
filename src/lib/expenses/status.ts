import type {
  ExpenseApprovalStatus,
  ExpensePostingStatus,
  ExpenseReimbursementStatus,
} from "./types";

/** Allowed approval transitions for the EM claim lifecycle. */
const APPROVAL_TRANSITIONS: Record<ExpenseApprovalStatus, readonly ExpenseApprovalStatus[]> = {
  draft: ["submitted", "voided"],
  submitted: ["in_review", "withdrawn", "returned", "rejected", "approved"],
  in_review: ["approved", "returned", "rejected", "withdrawn"],
  approved: ["voided"],
  returned: ["submitted", "withdrawn", "voided"],
  rejected: ["voided"],
  withdrawn: ["draft", "voided"],
  voided: [],
};

const POSTING_TRANSITIONS: Record<ExpensePostingStatus, readonly ExpensePostingStatus[]> = {
  not_posted: ["ready"],
  ready: ["posting", "not_posted"],
  posting: ["posted", "failed"],
  posted: ["reversed"],
  failed: ["ready", "not_posted"],
  reversed: ["not_posted"],
};

const REIMBURSEMENT_TRANSITIONS: Record<
  ExpenseReimbursementStatus,
  readonly ExpenseReimbursementStatus[]
> = {
  not_eligible: ["eligible"],
  eligible: ["awaiting_payment", "not_eligible"],
  awaiting_payment: ["payment_initiated", "eligible"],
  payment_initiated: ["partially_paid", "paid", "payment_failed"],
  partially_paid: ["payment_initiated", "paid", "refunded"],
  paid: ["refunded"],
  payment_failed: ["awaiting_payment", "eligible"],
  refunded: [],
};

export function canTransitionApproval(
  from: ExpenseApprovalStatus,
  to: ExpenseApprovalStatus,
): boolean {
  return APPROVAL_TRANSITIONS[from].includes(to);
}

export function canTransitionPosting(
  from: ExpensePostingStatus,
  to: ExpensePostingStatus,
): boolean {
  return POSTING_TRANSITIONS[from].includes(to);
}

export function canTransitionReimbursement(
  from: ExpenseReimbursementStatus,
  to: ExpenseReimbursementStatus,
): boolean {
  return REIMBURSEMENT_TRANSITIONS[from].includes(to);
}

/** Approved claims become posting-ready and reimbursement-eligible when employee-paid. */
export function statusesAfterApproval(paymentSource: string): {
  approvalStatus: ExpenseApprovalStatus;
  postingStatus: ExpensePostingStatus;
  reimbursementStatus: ExpenseReimbursementStatus;
} {
  const reimbursementStatus: ExpenseReimbursementStatus =
    paymentSource === "employee_paid" ? "eligible" : "not_eligible";
  return {
    approvalStatus: "approved",
    postingStatus: "ready",
    reimbursementStatus,
  };
}

/** Payment file generation or payout API submission must not mark a claim paid. */
export function isPaidReimbursementStatus(status: ExpenseReimbursementStatus): boolean {
  return status === "paid" || status === "partially_paid" || status === "refunded";
}

export function assertApprovalTransition(
  from: ExpenseApprovalStatus,
  to: ExpenseApprovalStatus,
): void {
  if (!canTransitionApproval(from, to)) {
    throw new Error(`Invalid expense approval transition: ${from} → ${to}`);
  }
}
