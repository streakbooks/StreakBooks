/** A posted payment already reduces its payslip's outstanding amount.
 * Never re-run *fresh-payment* outstanding checks when an idempotency key
 * already belongs to a payment: that rejects valid network retries.
 *
 * The PostgreSQL record_payroll_payment RPC remains the final authority:
 * it compares every submitted field and allocation against the original
 * payment, rejects changed payloads and rejects reversed payment keys.
 */
export function mustValidateFreshPayrollAllocations(
  existingPaymentId: string | null | undefined,
): boolean {
  return !existingPaymentId;
}
