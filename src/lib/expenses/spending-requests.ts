export const EXPENSE_SPENDING_REQUEST_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "returned",
  "rejected",
  "cancelled",
] as const;

export type ExpenseSpendingRequestStatus = (typeof EXPENSE_SPENDING_REQUEST_STATUSES)[number];

export type ExpenseSpendingRequestDraftInput = {
  id?: string;
  version?: number;
  title: string;
  description?: string;
  neededBy?: string | null;
  currencyCode: string;
  amountMinor: number;
};

export type ExpenseSpendingRequestSummary = {
  id: string;
  requestNumber: string;
  title: string;
  description: string | null;
  neededBy: string | null;
  currencyCode: string;
  amountMinor: number;
  status: ExpenseSpendingRequestStatus;
  decisionNote: string | null;
  version: number;
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

export function mapExpenseSpendingRequest(row: unknown): ExpenseSpendingRequestSummary {
  const r = asRecord(row);
  return {
    id: str(r.id),
    requestNumber: str(r.request_number ?? r.requestNumber),
    title: str(r.title),
    description: (r.description as string | null) ?? null,
    neededBy: (r.needed_by ?? r.neededBy ?? null) as string | null,
    currencyCode: str(r.currency_code ?? r.currencyCode, "USD"),
    amountMinor: num(r.amount_minor ?? r.amountMinor),
    status: str(r.status, "draft") as ExpenseSpendingRequestStatus,
    decisionNote: (r.decision_note ?? r.decisionNote ?? null) as string | null,
    version: num(r.version),
    updatedAt: str(r.updated_at ?? r.updatedAt),
  };
}

export function toExpenseSpendingRequestPayload(
  draft: ExpenseSpendingRequestDraftInput,
): Record<string, unknown> {
  return {
    id: draft.id ?? null,
    version: draft.version ?? 1,
    title: draft.title.trim(),
    description: draft.description?.trim() || null,
    needed_by: draft.neededBy || null,
    currency_code: draft.currencyCode.toUpperCase(),
    amount_minor: draft.amountMinor,
  };
}

/** Pure policy check used by UI and unit tests. */
export function spendingRequestRequiredForClaim(input: {
  thresholdMinor: number;
  claimTotalMinor: number;
  linkedRequestStatus?: ExpenseSpendingRequestStatus | null;
  linkedRequestAmountMinor?: number | null;
}): { ok: true } | { ok: false; error: string } {
  if (input.thresholdMinor <= 0 || input.claimTotalMinor < input.thresholdMinor) {
    return { ok: true };
  }
  if (!input.linkedRequestStatus) {
    return {
      ok: false,
      error: "Link an approved spending request before submitting this claim.",
    };
  }
  if (input.linkedRequestStatus !== "approved") {
    return { ok: false, error: "Linked spending request must be approved." };
  }
  if ((input.linkedRequestAmountMinor ?? 0) < input.claimTotalMinor) {
    return {
      ok: false,
      error: "Linked spending request amount is lower than this claim total.",
    };
  }
  return { ok: true };
}
