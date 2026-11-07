export const EXPENSE_CASH_ADVANCE_STATUSES = [
  "draft",
  "issued",
  "partially_settled",
  "settled",
  "cancelled",
] as const;

export type ExpenseCashAdvanceStatus = (typeof EXPENSE_CASH_ADVANCE_STATUSES)[number];

export type ExpenseCashAdvance = {
  id: string;
  advanceNumber: string;
  title: string;
  description: string | null;
  employeeUserId: string;
  advanceDate: string;
  currencyCode: string;
  amountMinor: number;
  remainingMinor: number;
  status: ExpenseCashAdvanceStatus;
  bankAccountId: string | null;
  issueJournalId: string | null;
  version: number;
  updatedAt: string;
};

export type ExpenseCashAdvanceDraftInput = {
  id?: string;
  version?: number;
  title: string;
  description?: string;
  advanceDate: string;
  currencyCode: string;
  amountMinor: number;
  notes?: string;
  employeeUserId?: string;
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

export function mapExpenseCashAdvance(row: unknown): ExpenseCashAdvance {
  const r = asRecord(row);
  const status = str(r["status"], "draft") as ExpenseCashAdvanceStatus;
  return {
    id: str(r["id"]),
    advanceNumber: str(r["advance_number"] ?? r["advanceNumber"]),
    title: str(r["title"]),
    description: (r["description"] ?? null) as string | null,
    employeeUserId: str(r["employee_user_id"] ?? r["employeeUserId"]),
    advanceDate: str(r["advance_date"] ?? r["advanceDate"]),
    currencyCode: str(r["currency_code"] ?? r["currencyCode"]).toUpperCase(),
    amountMinor: num(r["amount_minor"] ?? r["amountMinor"]),
    remainingMinor: num(r["remaining_minor"] ?? r["remainingMinor"]),
    status: EXPENSE_CASH_ADVANCE_STATUSES.includes(status) ? status : "draft",
    bankAccountId: (r["bank_account_id"] ?? r["bankAccountId"] ?? null) as string | null,
    issueJournalId: (r["issue_journal_id"] ?? r["issueJournalId"] ?? null) as string | null,
    version: num(r["version"]),
    updatedAt: str(r["updated_at"] ?? r["updatedAt"]),
  };
}

export function toExpenseCashAdvancePayload(
  draft: ExpenseCashAdvanceDraftInput,
): Record<string, unknown> {
  return {
    id: draft.id ?? null,
    version: draft.version ?? 0,
    title: draft.title,
    description: draft.description ?? null,
    advance_date: draft.advanceDate,
    currency_code: draft.currencyCode,
    amount_minor: draft.amountMinor,
    notes: draft.notes ?? null,
    employee_user_id: draft.employeeUserId ?? null,
  };
}

export function canIssueCashAdvance(input: {
  status: string;
  amountMinor: number;
}): { ok: true } | { ok: false; error: string } {
  if (input.status !== "draft") {
    return { ok: false, error: "Only draft advances can be issued." };
  }
  if (input.amountMinor <= 0) {
    return { ok: false, error: "Advance amount must be greater than zero." };
  }
  return { ok: true };
}

/** Unused (or partially used) issued advances can be reclaimed to bank. */
export function canReclaimCashAdvance(input: {
  status: string;
  remainingMinor: number;
}): { ok: true } | { ok: false; error: string } {
  if (!["issued", "partially_settled"].includes(input.status)) {
    return { ok: false, error: "Only issued advances with remaining balance can be reclaimed." };
  }
  if (input.remainingMinor <= 0) {
    return { ok: false, error: "Advance has no remaining balance to reclaim." };
  }
  return { ok: true };
}

export function buildCashAdvanceIssueLines(input: {
  advanceAccountId: string;
  bankAccountId: string;
  amountMinor: number;
  advanceNumber: string;
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
  if (!input.advanceAccountId || !input.bankAccountId) {
    return { ok: false, error: "Advance and bank accounts are required." };
  }
  if (input.advanceAccountId === input.bankAccountId) {
    return { ok: false, error: "Advance account and bank account must be different." };
  }
  if (input.amountMinor <= 0) {
    return { ok: false, error: "Advance amount must be greater than zero." };
  }
  return {
    ok: true,
    lines: [
      {
        accountId: input.advanceAccountId,
        debitMinor: input.amountMinor,
        creditMinor: 0,
        description: `Cash advance ${input.advanceNumber}`,
      },
      {
        accountId: input.bankAccountId,
        debitMinor: 0,
        creditMinor: input.amountMinor,
        description: `Issue advance ${input.advanceNumber}`,
      },
    ],
  };
}

export function buildCashAdvanceSettlementCredit(input: {
  advanceAccountId: string;
  amountMinor: number;
  advanceNumber: string;
}): { ok: true; accountId: string; creditMinor: number; description: string } | { ok: false; error: string } {
  if (!input.advanceAccountId) {
    return { ok: false, error: "Employee advance account is required." };
  }
  if (input.amountMinor <= 0) {
    return { ok: false, error: "Settlement amount must be greater than zero." };
  }
  return {
    ok: true,
    accountId: input.advanceAccountId,
    creditMinor: input.amountMinor,
    description: `Settle advance ${input.advanceNumber}`,
  };
}
