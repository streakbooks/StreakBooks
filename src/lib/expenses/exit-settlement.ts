export type ExpenseExitSettlementStatus = "draft" | "finalized" | "cancelled";

export type ExpenseExitOutstanding = {
  employeeUserId: string;
  openAdvances: Array<{
    id: string;
    advanceNumber: string;
    remainingMinor: number;
    currencyCode: string;
    status: string;
    version: number;
  }>;
  openClaims: Array<{
    id: string;
    claimNumber: string;
    approvalStatus: string;
    reimbursementStatus: string;
    totalMinor: number;
    claimCurrency: string;
  }>;
  openCardTransactions: Array<{
    id: string;
    description: string;
    amountMinor: number;
    currencyCode: string;
    status: string;
  }>;
};

export type ExpenseExitSettlement = {
  id: string;
  settlementNumber: string;
  employeeUserId: string;
  status: ExpenseExitSettlementStatus;
  settlementDate: string;
  bankAccountId: string | null;
  notes: string | null;
  outstandingSnapshot: ExpenseExitOutstanding | null;
  version: number;
  finalizedAt: string | null;
  updatedAt: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export function mapExpenseExitOutstanding(row: unknown): ExpenseExitOutstanding {
  const r = asRecord(row);
  const advances = Array.isArray(r["open_advances"]) ? r["open_advances"] : [];
  const claims = Array.isArray(r["open_claims"]) ? r["open_claims"] : [];
  const txs = Array.isArray(r["open_card_transactions"]) ? r["open_card_transactions"] : [];
  return {
    employeeUserId: str(r["employee_user_id"] ?? r["employeeUserId"]),
    openAdvances: advances.map((item) => {
      const a = asRecord(item);
      return {
        id: str(a["id"]),
        advanceNumber: str(a["advance_number"] ?? a["advanceNumber"]),
        remainingMinor: num(a["remaining_minor"] ?? a["remainingMinor"]),
        currencyCode: str(a["currency_code"] ?? a["currencyCode"]).toUpperCase(),
        status: str(a["status"]),
        version: num(a["version"]),
      };
    }),
    openClaims: claims.map((item) => {
      const c = asRecord(item);
      return {
        id: str(c["id"]),
        claimNumber: str(c["claim_number"] ?? c["claimNumber"]),
        approvalStatus: str(c["approval_status"] ?? c["approvalStatus"]),
        reimbursementStatus: str(c["reimbursement_status"] ?? c["reimbursementStatus"]),
        totalMinor: num(c["total_minor"] ?? c["totalMinor"]),
        claimCurrency: str(c["claim_currency"] ?? c["claimCurrency"]).toUpperCase(),
      };
    }),
    openCardTransactions: txs.map((item) => {
      const t = asRecord(item);
      return {
        id: str(t["id"]),
        description: str(t["description"] || t["merchant_name"] || "Card transaction"),
        amountMinor: num(t["amount_minor"] ?? t["amountMinor"]),
        currencyCode: str(t["currency_code"] ?? t["currencyCode"]).toUpperCase(),
        status: str(t["status"]),
      };
    }),
  };
}

export function mapExpenseExitSettlement(row: unknown): ExpenseExitSettlement {
  const r = asRecord(row);
  const status = str(r["status"], "draft") as ExpenseExitSettlementStatus;
  const snapshotRaw = r["outstanding_snapshot"] ?? r["outstandingSnapshot"];
  return {
    id: str(r["id"]),
    settlementNumber: str(r["settlement_number"] ?? r["settlementNumber"]),
    employeeUserId: str(r["employee_user_id"] ?? r["employeeUserId"]),
    status:
      status === "finalized" || status === "cancelled" || status === "draft" ? status : "draft",
    settlementDate: str(r["settlement_date"] ?? r["settlementDate"]),
    bankAccountId: (r["bank_account_id"] ?? r["bankAccountId"] ?? null) as string | null,
    notes: (r["notes"] ?? null) as string | null,
    outstandingSnapshot: snapshotRaw ? mapExpenseExitOutstanding(snapshotRaw) : null,
    version: num(r["version"]),
    finalizedAt: (r["finalized_at"] ?? r["finalizedAt"] ?? null) as string | null,
    updatedAt: str(r["updated_at"] ?? r["updatedAt"]),
  };
}

export function canFinalizeExitSettlement(input: {
  status: string;
  openSubmittedClaims: number;
  openCardTransactions: number;
  bankAccountId: string | null | undefined;
}): { ok: true } | { ok: false; error: string } {
  if (input.status !== "draft") {
    return { ok: false, error: "Only draft exit settlements can be finalized." };
  }
  if (!input.bankAccountId) {
    return { ok: false, error: "Choose a bank account for advance reclaim." };
  }
  if (input.openSubmittedClaims > 0) {
    return {
      ok: false,
      error: "Resolve submitted/in-review claims before finalizing.",
    };
  }
  if (input.openCardTransactions > 0) {
    return {
      ok: false,
      error: "Clear unmatched or disputed card transactions before finalizing.",
    };
  }
  return { ok: true };
}

export function summarizeExitOutstanding(outstanding: ExpenseExitOutstanding): {
  advanceRemainingMinor: number;
  openClaimCount: number;
  openCardCount: number;
  blocking: boolean;
} {
  const advanceRemainingMinor = outstanding.openAdvances.reduce(
    (sum, adv) => sum + adv.remainingMinor,
    0,
  );
  const openClaimCount = outstanding.openClaims.length;
  const openCardCount = outstanding.openCardTransactions.length;
  const openSubmitted = outstanding.openClaims.filter((c) =>
    ["submitted", "in_review"].includes(c.approvalStatus),
  ).length;
  return {
    advanceRemainingMinor,
    openClaimCount,
    openCardCount,
    blocking: openSubmitted > 0 || openCardCount > 0,
  };
}
