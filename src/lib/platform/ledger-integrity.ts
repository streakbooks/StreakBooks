export type LedgerCheckStatus = "pass" | "warn" | "fail";

/** Company members already authorised by ledger_health_check. Platform role is not an input. */
export function ledgerMonitorSummary(input: {
  membership: boolean;
  canViewAccounting: boolean;
  checks: readonly { status: LedgerCheckStatus }[] | null;
}): { status: "unchecked" | LedgerCheckStatus } {
  if (!input.membership) throw new Error("You do not have access to that organisation");
  if (!input.canViewAccounting) throw new Error("You do not have permission to view accounting");
  if (input.checks === null || input.checks.length === 0) return { status: "unchecked" };
  if (input.checks.some((check) => check.status === "fail")) return { status: "fail" };
  if (input.checks.some((check) => check.status === "warn")) return { status: "warn" };
  return { status: "pass" };
}
