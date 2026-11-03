/** Pure account visibility policy for posted General Ledger reports. */
export type LedgerAccountScope = "transactions" | "balance" | "all";

export function shouldIncludeLedgerAccount(
  scope: LedgerAccountScope,
  postedLineCount: number,
  openingBalance: bigint,
): boolean {
  if (scope === "all") return true;
  if (postedLineCount > 0) return true;
  return scope === "balance" && openingBalance !== 0n;
}
