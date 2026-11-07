export const EXPENSE_PETTY_CASH_FLOAT_STATUSES = ["active", "closed"] as const;

export type ExpensePettyCashFloatStatus =
  (typeof EXPENSE_PETTY_CASH_FLOAT_STATUSES)[number];

export type ExpensePettyCashFloat = {
  id: string;
  floatNumber: string;
  name: string;
  description: string | null;
  custodianUserId: string;
  currencyCode: string;
  targetMinor: number;
  balanceMinor: number;
  status: ExpensePettyCashFloatStatus;
  version: number;
  updatedAt: string;
};

export type ExpensePettyCashFloatDraftInput = {
  id?: string;
  version?: number;
  name: string;
  description?: string;
  currencyCode: string;
  targetMinor: number;
  notes?: string;
  custodianUserId?: string;
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

export function mapExpensePettyCashFloat(row: unknown): ExpensePettyCashFloat {
  const r = asRecord(row);
  const status = str(r.status, "active") as ExpensePettyCashFloatStatus;
  return {
    id: str(r.id),
    floatNumber: str(r.float_number ?? r.floatNumber),
    name: str(r.name),
    description: (r.description ?? null) as string | null,
    custodianUserId: str(r.custodian_user_id ?? r.custodianUserId),
    currencyCode: str(r.currency_code ?? r.currencyCode).toUpperCase(),
    targetMinor: num(r.target_minor ?? r.targetMinor),
    balanceMinor: num(r.balance_minor ?? r.balanceMinor),
    status: EXPENSE_PETTY_CASH_FLOAT_STATUSES.includes(status) ? status : "active",
    version: num(r.version),
    updatedAt: str(r.updated_at ?? r.updatedAt),
  };
}

export function toExpensePettyCashFloatPayload(
  draft: ExpensePettyCashFloatDraftInput,
): Record<string, unknown> {
  return {
    id: draft.id ?? null,
    version: draft.version ?? 0,
    name: draft.name,
    description: draft.description ?? null,
    currency_code: draft.currencyCode,
    target_minor: draft.targetMinor,
    notes: draft.notes ?? null,
    custodian_user_id: draft.custodianUserId ?? null,
  };
}

/** Amount needed to top the float back up to its target. */
export function replenishAmountMinor(input: {
  targetMinor: number;
  balanceMinor: number;
}): number {
  return Math.max(0, input.targetMinor - input.balanceMinor);
}

export function canFundPettyCashFloat(input: {
  status: string;
  amountMinor: number;
}): { ok: true } | { ok: false; error: string } {
  if (input.status !== "active") {
    return { ok: false, error: "Only active floats can be funded." };
  }
  if (input.amountMinor <= 0) {
    return { ok: false, error: "Fund amount must be greater than zero." };
  }
  return { ok: true };
}

export function buildPettyCashFundLines(input: {
  pettyCashAccountId: string;
  bankAccountId: string;
  amountMinor: number;
  floatNumber: string;
}):
  | {
      ok: true;
      lines: Array<{
        accountId: string;
        debitMinor: number;
        creditMinor: number;
        description: string;
      }>;
    }
  | { ok: false; error: string } {
  if (!input.pettyCashAccountId || !input.bankAccountId) {
    return { ok: false, error: "Petty cash and bank accounts are required." };
  }
  if (input.pettyCashAccountId === input.bankAccountId) {
    return { ok: false, error: "Petty cash account and bank account must be different." };
  }
  if (input.amountMinor <= 0) {
    return { ok: false, error: "Fund amount must be greater than zero." };
  }
  return {
    ok: true,
    lines: [
      {
        accountId: input.pettyCashAccountId,
        debitMinor: input.amountMinor,
        creditMinor: 0,
        description: `Fund petty cash ${input.floatNumber}`,
      },
      {
        accountId: input.bankAccountId,
        debitMinor: 0,
        creditMinor: input.amountMinor,
        description: `Bank transfer to ${input.floatNumber}`,
      },
    ],
  };
}
