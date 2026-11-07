export const EXPENSE_CORPORATE_CARD_STATUSES = ["active", "suspended", "closed"] as const;
export type ExpenseCorporateCardStatus =
  (typeof EXPENSE_CORPORATE_CARD_STATUSES)[number];

export const EXPENSE_CARD_TX_STATUSES = [
  "unmatched",
  "matched",
  "excluded",
  "disputed",
] as const;
export type ExpenseCorporateCardTxStatus =
  (typeof EXPENSE_CARD_TX_STATUSES)[number];

export type ExpenseCorporateCard = {
  id: string;
  label: string;
  network: string | null;
  last4: string;
  holderUserId: string | null;
  liabilityAccountId: string;
  currencyCode: string;
  status: ExpenseCorporateCardStatus;
  version: number;
  updatedAt: string;
};

export type ExpenseCorporateCardTransaction = {
  id: string;
  cardId: string;
  transactionDate: string;
  postedDate: string | null;
  merchantName: string | null;
  description: string;
  amountMinor: number;
  currencyCode: string;
  status: ExpenseCorporateCardTxStatus;
  matchedClaimId: string | null;
  externalRef: string | null;
};

export type ExpenseCorporateCardDraftInput = {
  id?: string;
  version?: number;
  label: string;
  network?: string | null;
  last4: string;
  holderUserId?: string | null;
  liabilityAccountId: string;
  currencyCode: string;
  status?: ExpenseCorporateCardStatus;
  notes?: string;
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

export function mapExpenseCorporateCard(row: unknown): ExpenseCorporateCard {
  const r = asRecord(row);
  const status = str(r.status, "active") as ExpenseCorporateCardStatus;
  return {
    id: str(r.id),
    label: str(r.label),
    network: (r.network ?? null) as string | null,
    last4: str(r.last4),
    holderUserId: (r.holder_user_id ?? r.holderUserId ?? null) as string | null,
    liabilityAccountId: str(r.liability_account_id ?? r.liabilityAccountId),
    currencyCode: str(r.currency_code ?? r.currencyCode).toUpperCase(),
    status: EXPENSE_CORPORATE_CARD_STATUSES.includes(status) ? status : "active",
    version: num(r.version),
    updatedAt: str(r.updated_at ?? r.updatedAt),
  };
}

export function mapExpenseCorporateCardTransaction(
  row: unknown,
): ExpenseCorporateCardTransaction {
  const r = asRecord(row);
  const status = str(r.status, "unmatched") as ExpenseCorporateCardTxStatus;
  return {
    id: str(r.id),
    cardId: str(r.card_id ?? r.cardId),
    transactionDate: str(r.transaction_date ?? r.transactionDate),
    postedDate: (r.posted_date ?? r.postedDate ?? null) as string | null,
    merchantName: (r.merchant_name ?? r.merchantName ?? null) as string | null,
    description: str(r.description),
    amountMinor: num(r.amount_minor ?? r.amountMinor),
    currencyCode: str(r.currency_code ?? r.currencyCode).toUpperCase(),
    status: EXPENSE_CARD_TX_STATUSES.includes(status) ? status : "unmatched",
    matchedClaimId: (r.matched_claim_id ?? r.matchedClaimId ?? null) as string | null,
    externalRef: (r.external_ref ?? r.externalRef ?? null) as string | null,
  };
}

export function toExpenseCorporateCardPayload(
  draft: ExpenseCorporateCardDraftInput,
): Record<string, unknown> {
  return {
    id: draft.id ?? null,
    version: draft.version ?? 0,
    label: draft.label,
    network: draft.network ?? null,
    last4: draft.last4,
    holder_user_id: draft.holderUserId ?? null,
    liability_account_id: draft.liabilityAccountId,
    currency_code: draft.currencyCode.toUpperCase(),
    status: draft.status ?? "active",
    notes: draft.notes ?? null,
  };
}

export function toExpenseCorporateCardTxPayload(input: {
  id?: string;
  cardId: string;
  transactionDate: string;
  postedDate?: string | null;
  merchantName?: string | null;
  description: string;
  amountMinor: number;
  currencyCode?: string;
  externalRef?: string | null;
}): Record<string, unknown> {
  return {
    id: input.id ?? null,
    card_id: input.cardId,
    transaction_date: input.transactionDate,
    posted_date: input.postedDate ?? null,
    merchant_name: input.merchantName ?? null,
    description: input.description,
    amount_minor: input.amountMinor,
    currency_code: input.currencyCode ?? null,
    external_ref: input.externalRef ?? null,
  };
}

export function canMatchCardTransaction(input: {
  txStatus: string;
  txAmountMinor: number;
  txCurrency: string;
  txCardId: string;
  claimPaymentSource: string;
  claimTotalMinor: number;
  claimCurrency: string;
  claimCardId: string | null;
}): { ok: true } | { ok: false; error: string } {
  if (!["unmatched", "disputed"].includes(input.txStatus)) {
    return { ok: false, error: "Only unmatched or disputed transactions can be matched." };
  }
  if (input.claimPaymentSource !== "corporate_card") {
    return { ok: false, error: "Claim payment source must be corporate card." };
  }
  if (!input.claimCardId || input.claimCardId !== input.txCardId) {
    return { ok: false, error: "Claim must be linked to the same card." };
  }
  if (input.claimCurrency !== input.txCurrency) {
    return { ok: false, error: "Claim currency must match the transaction." };
  }
  if (input.claimTotalMinor !== input.txAmountMinor) {
    return { ok: false, error: "Claim total must equal the transaction amount." };
  }
  return { ok: true };
}

export function buildCorporateCardAccrualCredit(input: {
  liabilityAccountId: string;
  amountMinor: number;
  last4: string;
}): { ok: true; accountId: string; creditMinor: number; description: string } | { ok: false; error: string } {
  if (!input.liabilityAccountId) {
    return { ok: false, error: "Card liability account is required." };
  }
  if (input.amountMinor <= 0) {
    return { ok: false, error: "Amount must be greater than zero." };
  }
  return {
    ok: true,
    accountId: input.liabilityAccountId,
    creditMinor: input.amountMinor,
    description: `Corporate card ****${input.last4}`,
  };
}
