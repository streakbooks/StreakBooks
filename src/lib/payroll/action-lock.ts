/** Synchronous per-screen lock for Payroll posting and reversal actions.
 * React mutation pending state may render on a later tick, so two immediate
 * clicks need a guard that updates before scheduling the network request.
 */
export function acquirePayrollMutationLock(lock: { current: boolean }): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releasePayrollMutationLock(lock: { current: boolean }): void {
  lock.current = false;
}
