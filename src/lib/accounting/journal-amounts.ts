/**
 * Journal debit/credit amounts are database minor-unit integers, not floating
 * point values. Reject unsafe JSON numbers and values outside UI precision.
 * Read-only: never modifies posted accounting entries.
 */
const MAX_EXACT_MINOR = BigInt(Number.MAX_SAFE_INTEGER);

function parseExactJournalMinor(value: number | string, label: string): bigint {
  if (
    (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) ||
    (typeof value === "string" && !/^\d+$/.test(value)) ||
    (typeof value !== "number" && typeof value !== "string")
  ) {
    throw new Error(`${label} contains an invalid or unsafe minor-unit amount.`);
  }
  const minor = BigInt(value);
  if (minor > MAX_EXACT_MINOR) {
    throw new Error(`${label} exceeds exact JavaScript integer precision.`);
  }
  return minor;
}

/** Fail closed when a single journal line is outside safe formatting bounds. */
export function exactJournalMinor(value: number | string, label = "Journal line"): number {
  return Number(parseExactJournalMinor(value, label));
}

/** Add using BigInt so a safe line-by-line payload cannot overflow silently. */
export function sumJournalDebits(lines: ReadonlyArray<{ debit_minor: number | string }>): number {
  let total = 0n;
  for (const line of lines) {
    total += parseExactJournalMinor(line.debit_minor, "Journal debit");
    if (total > MAX_EXACT_MINOR) {
      throw new Error("Journal debit total exceeds exact JavaScript integer precision.");
    }
  }
  return Number(total);
}
