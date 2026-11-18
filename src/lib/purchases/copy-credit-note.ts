/**
 * Map a stored supplier credit note into a new draft payload (copy credit).
 * Dates, numbers, allocations and posted journals are never copied — only
 * supplier, memo, currency and line amounts.
 */

export type StoredCreditLineForCopy = {
  description: string;
  account_id: string | null;
  net_minor: number;
  tax_minor?: number | null;
  line_no?: number | null;
};

export function mapCreditNoteLinesForCopy(lines: StoredCreditLineForCopy[]) {
  const ordered = [...lines].sort((a, b) => Number(a.line_no ?? 0) - Number(b.line_no ?? 0));
  return ordered.map((l, i) => {
    if (!l.account_id) {
      throw new Error(`Cannot copy credit line ${i + 1} without an expense/asset account`);
    }
    const description = (l.description ?? "").trim();
    if (!description) {
      throw new Error(`Cannot copy credit line ${i + 1} without a description`);
    }
    const netMinor = Math.floor(Number(l.net_minor) || 0);
    const taxMinor = Math.floor(Number(l.tax_minor ?? 0) || 0);
    if (netMinor < 0 || taxMinor < 0) {
      throw new Error(`Cannot copy credit line ${i + 1} with a negative amount`);
    }
    return {
      description,
      accountId: l.account_id,
      netMinor,
      taxMinor,
    };
  });
}
