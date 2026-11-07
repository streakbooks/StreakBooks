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

export type BatchReimburseResult = {
  paidCount: number;
  failedCount: number;
  results: Array<{ claimId: string; ok: boolean; claimNumber?: string; error?: string }>;
};

export function mapBatchReimburseResult(row: unknown): BatchReimburseResult {
  const r =
    row && typeof row === "object" ? (row as Record<string, unknown>) : ({} as Record<string, unknown>);
  const results = Array.isArray(r["results"]) ? r["results"] : [];
  return {
    paidCount: typeof r["paid_count"] === "number" ? r["paid_count"] : Number(r["paid_count"] ?? 0),
    failedCount:
      typeof r["failed_count"] === "number" ? r["failed_count"] : Number(r["failed_count"] ?? 0),
    results: results.map((item) => {
      const entry =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : ({} as Record<string, unknown>);
      return {
        claimId: String(entry["claim_id"] ?? entry["claimId"] ?? ""),
        ok: Boolean(entry["ok"]),
        claimNumber:
          typeof entry["claim_number"] === "string"
            ? entry["claim_number"]
            : typeof entry["claimNumber"] === "string"
              ? entry["claimNumber"]
              : undefined,
        error: typeof entry["error"] === "string" ? entry["error"] : undefined,
      };
    }),
  };
}

/** Summarise a batch pay run for toast copy. */
export function formatBatchReimburseSummary(result: BatchReimburseResult): string {
  if (result.paidCount === 0 && result.failedCount === 0) {
    return "No claims were processed.";
  }
  if (result.failedCount === 0) {
    return `Reimbursed ${result.paidCount} claim(s).`;
  }
  return `Reimbursed ${result.paidCount}; ${result.failedCount} failed.`;
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
