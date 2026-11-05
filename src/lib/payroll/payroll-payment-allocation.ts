/** Pure helpers for payroll net-pay payment allocations (bigint-safe). */

export type PayslipOutstanding = {
  payslipId: string;
  netMinor: bigint;
  paidMinor: bigint;
};

export type PaymentAllocationInput = {
  payslipId: string;
  amountMinor: bigint;
};

export type AllocationValidationResult =
  { ok: true; allocTotal: bigint; unallocated: bigint } | { ok: false; error: string };

export function payslipOutstanding(p: PayslipOutstanding): bigint {
  const left = p.netMinor - p.paidMinor;
  return left > 0n ? left : 0n;
}

export function derivePayslipPaymentStatus(
  netMinor: bigint,
  paidMinor: bigint,
): "unpaid" | "partial" | "paid" {
  if (paidMinor <= 0n) return "unpaid";
  if (paidMinor >= netMinor) return "paid";
  return "partial";
}

export function validatePayrollPaymentAllocations(
  paymentAmountMinor: bigint,
  allocations: PaymentAllocationInput[],
  payslips: PayslipOutstanding[],
): AllocationValidationResult {
  if (paymentAmountMinor <= 0n) {
    return { ok: false, error: "Payment amount must be positive" };
  }
  const byId = new Map(payslips.map((p) => [p.payslipId, p]));
  const seen = new Set<string>();
  let allocTotal = 0n;

  for (const a of allocations) {
    if (!a.payslipId) return { ok: false, error: "Each allocation needs a payslip" };
    if (seen.has(a.payslipId)) {
      return { ok: false, error: "Each payslip can only appear once per payment" };
    }
    seen.add(a.payslipId);
    if (a.amountMinor <= 0n) {
      return { ok: false, error: "Allocation amounts must be positive" };
    }
    const slip = byId.get(a.payslipId);
    if (!slip) return { ok: false, error: "Payslip not found for allocation" };
    const outstanding = payslipOutstanding(slip);
    if (a.amountMinor > outstanding) {
      return { ok: false, error: "Allocation exceeds payslip outstanding net pay" };
    }
    allocTotal += a.amountMinor;
  }

  if (allocTotal > paymentAmountMinor) {
    return { ok: false, error: "Allocations exceed the payment amount" };
  }

  return {
    ok: true,
    allocTotal,
    unallocated: paymentAmountMinor - allocTotal,
  };
}

/** Liability debit for the payment journal (allocated + unallocated net-pay reduction). */
export function payrollPaymentLiabilityDebit(
  paymentAmountMinor: bigint,
  allocTotal: bigint,
): bigint {
  void allocTotal;
  return paymentAmountMinor;
}
