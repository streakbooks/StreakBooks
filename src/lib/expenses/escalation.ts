import { mapExpenseClaimSummary, type ExpenseClaimSummary } from "@/lib/expenses/claims";

export type ExpenseApprovalEscalationList = {
  escalationDays: number;
  claims: ExpenseClaimSummary[];
};

export type ExpenseApprovalEscalationRefresh = {
  escalationDays: number;
  notifiedCount: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export function mapExpenseApprovalEscalationList(row: unknown): ExpenseApprovalEscalationList {
  const r = asRecord(row);
  const claims = Array.isArray(r["claims"]) ? r["claims"] : [];
  return {
    escalationDays: num(r["escalation_days"] ?? r["escalationDays"]),
    claims: claims.map(mapExpenseClaimSummary),
  };
}

export function mapExpenseApprovalEscalationRefresh(
  row: unknown,
): ExpenseApprovalEscalationRefresh {
  const r = asRecord(row);
  return {
    escalationDays: num(r["escalation_days"] ?? r["escalationDays"]),
    notifiedCount: num(r["notified_count"] ?? r["notifiedCount"]),
  };
}

export function formatEscalationRefreshSummary(
  result: ExpenseApprovalEscalationRefresh,
): string {
  if (result.escalationDays <= 0) {
    return "Escalation is disabled (0 days).";
  }
  return `Escalation refreshed for ${result.escalationDays}-day threshold (${result.notifiedCount} notification row(s)).`;
}
