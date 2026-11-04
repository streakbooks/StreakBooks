type PostingAmountLine = { debitMinor: number; creditMinor: number };

function realDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Validates untrusted server input before an authenticated posting call.
 * Rejects lossy Number coercion, missing/invalid money and unbalanced totals.
 * Database period/permission/account checks remain authoritative.
 */
export function assertManualJournalPosting(
  postingDate: string,
  autoReverseOn: string | undefined,
  lines: readonly PostingAmountLine[],
): void {
  if (!realDate(postingDate)) throw new Error("Choose a valid posting date.");
  if (autoReverseOn) {
    if (!realDate(autoReverseOn)) throw new Error("Choose a valid reversal date.");
    if (autoReverseOn <= postingDate) {
      throw new Error("The reversal date must be after the journal date.");
    }
  }
  if (!Array.isArray(lines) || lines.length < 2 || lines.length > 200) {
    throw new Error("Enter between 2 and 200 journal lines.");
  }
  let debit = 0n;
  let credit = 0n;
  for (const [index, row] of lines.entries()) {
    if (
      !Number.isSafeInteger(row?.debitMinor) ||
      !Number.isSafeInteger(row?.creditMinor) ||
      row.debitMinor < 0 ||
      row.creditMinor < 0 ||
      (row.debitMinor > 0 && row.creditMinor > 0) ||
      (row.debitMinor === 0 && row.creditMinor === 0)
    ) {
      throw new Error(`Journal line ${index + 1} must have one safe, positive debit or credit.`);
    }
    debit += BigInt(row.debitMinor);
    credit += BigInt(row.creditMinor);
  }
  if (debit === 0n || debit !== credit) {
    throw new Error("Journal debit and credit totals must be positive and balanced.");
  }
}
