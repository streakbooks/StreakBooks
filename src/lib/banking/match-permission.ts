/**
 * Match mutations must fail closed in the server fn before the SECURITY DEFINER RPC.
 * Mirrors `match_bank_transaction` / `match_bank_transactions_to_journal_line`:
 * banking.categorise OR banking.reconcile.
 */

export function isBankMatchPermissionGranted(opts: {
  hasCategorise: boolean;
  hasReconcile: boolean;
}): boolean {
  return opts.hasCategorise || opts.hasReconcile;
}

export function assertBankMatchPermissionGranted(opts: {
  hasCategorise: boolean;
  hasReconcile: boolean;
}): void {
  if (isBankMatchPermissionGranted(opts)) return;
  throw new Error("You do not have permission to perform this action for this organisation.");
}
