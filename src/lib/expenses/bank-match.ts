export type ExpenseReimbursementBankSuggestion = {
  claimId: string;
  claimNumber: string;
  claimTitle: string;
  claimDate: string;
  claimCurrency: string;
  remainingMinor: number;
  bankTransactionId: string;
  txnDate: string;
  bankAmountMinor: number;
  bankDescription: string | null;
  bankAccountId: string;
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

export function mapExpenseReimbursementBankSuggestions(
  row: unknown,
): ExpenseReimbursementBankSuggestion[] {
  const r = asRecord(row);
  const suggestions = Array.isArray(r["suggestions"]) ? r["suggestions"] : [];
  return suggestions.map((item) => {
    const s = asRecord(item);
    return {
      claimId: str(s["claim_id"] ?? s["claimId"]),
      claimNumber: str(s["claim_number"] ?? s["claimNumber"]),
      claimTitle: str(s["claim_title"] ?? s["claimTitle"]),
      claimDate: str(s["claim_date"] ?? s["claimDate"]),
      claimCurrency: str(s["claim_currency"] ?? s["claimCurrency"]).toUpperCase(),
      remainingMinor: num(s["remaining_minor"] ?? s["remainingMinor"]),
      bankTransactionId: str(s["bank_transaction_id"] ?? s["bankTransactionId"]),
      txnDate: str(s["txn_date"] ?? s["txnDate"]),
      bankAmountMinor: num(s["bank_amount_minor"] ?? s["bankAmountMinor"]),
      bankDescription: (s["bank_description"] ?? s["bankDescription"] ?? null) as string | null,
      bankAccountId: str(s["bank_account_id"] ?? s["bankAccountId"]),
    };
  });
}
