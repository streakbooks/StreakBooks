/**
 * Sum raw journal debit minor units exactly. A JSON number may already be rounded
 * above 2^53; fail closed rather than showing an inaccurate journal total.
 */
export function sumJournalDebits(
  lines: ReadonlyArray<{ debit_minor: number | string }>,
): number {
  let total = 0n;
  for (const line of lines) {
    const value = line.debit_minor;
    if (
      (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) ||
      (typeof value === "string" && !/^\\d+$/.test(value)) ||
      (typeof value !== "number" && typeof value !== "string")
    ) {
      throw new Error("Journal debit contains an invalid or unsafe minor-unit amount.");
    }
    total += BigInt(value);
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("Journal debit total exceeds exact JavaScript integer precision.");
    }
  }
  return Number(total);
}
