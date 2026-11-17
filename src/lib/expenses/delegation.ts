export type ExpenseApprovalDelegation = {
  id: string;
  companyId: string;
  fromUserId: string;
  toUserId: string;
  startsOn: string;
  endsOn: string;
  note: string | null;
  createdAt: string;
  revokedAt: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function mapExpenseApprovalDelegation(row: unknown): ExpenseApprovalDelegation {
  const r = asRecord(row);
  return {
    id: str(r["id"]),
    companyId: str(r["company_id"] ?? r["companyId"]),
    fromUserId: str(r["from_user_id"] ?? r["fromUserId"]),
    toUserId: str(r["to_user_id"] ?? r["toUserId"]),
    startsOn: str(r["starts_on"] ?? r["startsOn"]),
    endsOn: str(r["ends_on"] ?? r["endsOn"]),
    note: (r["note"] ?? null) as string | null,
    createdAt: str(r["created_at"] ?? r["createdAt"]),
    revokedAt: (r["revoked_at"] ?? r["revokedAt"] ?? null) as string | null,
  };
}

export function isDelegationActive(
  delegation: Pick<ExpenseApprovalDelegation, "startsOn" | "endsOn" | "revokedAt">,
  todayIso = new Date().toISOString().slice(0, 10),
): boolean {
  if (delegation.revokedAt) return false;
  return delegation.startsOn <= todayIso && todayIso <= delegation.endsOn;
}

export function userHasActiveIncomingDelegation(
  delegations: ExpenseApprovalDelegation[],
  userId: string,
  todayIso = new Date().toISOString().slice(0, 10),
): boolean {
  return delegations.some((row) => row.toUserId === userId && isDelegationActive(row, todayIso));
}
