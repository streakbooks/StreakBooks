/** Pure helpers for expense claim bank reimbursement (EM-07a). */

export function canReimburseClaim(input: {
  approvalStatus: string;
  postingStatus: string;
  paymentSource: string;
  reimbursementStatus: string;
  postedJournalId: string | null;
  reimbursableMinor: number;
}): { ok: true } | { ok: false; error: string } {
  if (input.approvalStatus !== "approved") {
    return { ok: false, error: "Only approved claims can be reimbursed." };
  }
  if (input.paymentSource !== "employee_paid") {
    return { ok: false, error: "Only employee-paid claims are reimbursed in EM-07a." };
  }
  if (input.postingStatus !== "posted" || !input.postedJournalId) {
    return { ok: false, error: "Post the claim accrual before reimbursing." };
  }
  if (input.reimbursementStatus === "paid") {
    return { ok: false, error: "Claim is already reimbursed." };
  }
  if (
    !["eligible", "awaiting_payment", "payment_initiated", "payment_failed"].includes(
      input.reimbursementStatus,
    )
  ) {
    return { ok: false, error: `Claim is not open for reimbursement (${input.reimbursementStatus}).` };
  }
  if (input.reimbursableMinor <= 0) {
    return { ok: false, error: "Claim has no reimbursable amount." };
  }
  return { ok: true };
}

export function buildReimbursementJournalLines(input: {
  payableAccountId: string;
  bankAccountId: string;
  amountMinor: number;
  claimNumber: string;
}): { ok: true; lines: Array<{ accountId: string; debitMinor: number; creditMinor: number; description: string }> } | { ok: false; error: string } {
  if (!input.payableAccountId || !input.bankAccountId) {
    return { ok: false, error: "Payable and bank accounts are required." };
  }
  if (input.payableAccountId === input.bankAccountId) {
    return { ok: false, error: "Payable account and bank account must be different." };
  }
  if (input.amountMinor <= 0) {
    return { ok: false, error: "Reimbursement amount must be greater than zero." };
  }
  return {
    ok: true,
    lines: [
      {
        accountId: input.payableAccountId,
        debitMinor: input.amountMinor,
        creditMinor: 0,
        description: `Reimburse ${input.claimNumber}`,
      },
      {
        accountId: input.bankAccountId,
        debitMinor: 0,
        creditMinor: input.amountMinor,
        description: `Bank payment ${input.claimNumber}`,
      },
    ],
  };
}
