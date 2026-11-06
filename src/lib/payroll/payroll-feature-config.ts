/** Feature Manager readiness for Basic Global Payroll (no I/O). */

export type BasicPayrollConfigSnapshot = {
  enabled: boolean;
  disclaimerAcknowledged: boolean;
  salaryExpenseAccountId: string | null;
  netPayLiabilityAccountId: string | null;
  deductionLiabilityAccountId: string | null;
  activeScheduleCount: number;
};

export function isBasicPayrollConfigComplete(snapshot: BasicPayrollConfigSnapshot): boolean {
  if (!snapshot.enabled) return false;
  const glMapped = Boolean(
    snapshot.salaryExpenseAccountId &&
    snapshot.netPayLiabilityAccountId &&
    snapshot.deductionLiabilityAccountId,
  );
  return snapshot.disclaimerAcknowledged && glMapped && snapshot.activeScheduleCount > 0;
}
