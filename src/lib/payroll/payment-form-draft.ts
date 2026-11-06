/** Validate payroll settlement form values without silently discarding allocations.
 * Ledger minor-unit amounts must remain safe integers until the API supports strings.
 */
import { tryParseMinor } from "@/lib/purchases/money-input";
import { validatePayrollPaymentAllocations } from "@/lib/payroll/payroll-payment-allocation";

export type PayrollPaymentFormPayslip = {
  payslipId: string;
  currency: string;
  netMinor: number;
  paidMinor: number;
};

export type ParsedPayrollPaymentEntry = {
  amountMinor: number;
  allocations: Array<{ payslipId: string; amountMinor: number }>;
  unallocatedMinor: number;
};

function safeMinorNumber(minor: bigint, field: string): number {
  if (minor <= 0n) throw new Error(`${field} must be greater than zero.`);
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${field} exceeds the supported safe integer range.`);
  }
  return Number(minor);
}

/** An empty allocation cell means no allocation; a non-empty invalid cell is an error. */
export function parsePayrollPaymentEntry(input: {
  amount: string;
  currency: string;
  allocations: Record<string, string>;
  payslips: PayrollPaymentFormPayslip[];
}): ParsedPayrollPaymentEntry {
  const currency = input.currency.toUpperCase();
  const rawAmount = tryParseMinor(input.amount, currency);
  if (rawAmount === null) throw new Error("Payment amount is invalid.");
  const amountMinor = safeMinorNumber(rawAmount, "Payment amount");
  const byId = new Map(input.payslips.map((row) => [row.payslipId, row]));
  const allocations: Array<{ payslipId: string; amountMinor: number }> = [];

  for (const [payslipId, entered] of Object.entries(input.allocations)) {
    if (!entered.trim()) continue;
    const slip = byId.get(payslipId);
    if (!slip) throw new Error("An allocation refers to a missing or closed payslip. Refresh the payment form.");
    if (slip.currency.toUpperCase() !== currency) {
      throw new Error("An allocation currency differs from the payment currency.");
    }
    const parsed = tryParseMinor(entered, currency);
    if (parsed === null) {
      throw new Error(`Allocation for payslip ${payslipId} is invalid.`);
    }
    allocations.push({
      payslipId,
      amountMinor: safeMinorNumber(parsed, `Allocation for payslip ${payslipId}`),
    });
  }

  const validated = validatePayrollPaymentAllocations(
    BigInt(amountMinor),
    allocations.map((allocation) => ({
      payslipId: allocation.payslipId,
      amountMinor: BigInt(allocation.amountMinor),
    })),
    input.payslips.map((row) => ({
      payslipId: row.payslipId,
      netMinor: BigInt(row.netMinor),
      paidMinor: BigInt(row.paidMinor),
    })),
  );
  if (!validated.ok) throw new Error(validated.error);
  return {
    amountMinor,
    allocations,
    unallocatedMinor: Number(validated.unallocated),
  };
}
