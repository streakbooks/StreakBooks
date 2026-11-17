import type { ReconciliationAccountRow } from "./reconciliation";

export type ReconciliationReviewFilters = {
  status: "all" | "variance" | "matched";
  query: string;
  order: "account" | "largest_difference";
};

function exactMinor(value: string): bigint {
  if (!/^-?\d+$/.test(value)) throw new Error("Invalid reconciliation variance.");
  return BigInt(value);
}
const abs = (value: bigint) => (value < 0n ? -value : value);

/** Read-only distribution of absolute differences, never netted for materiality. */
export function summarizeReconciliationExceptions(rows: readonly ReconciliationAccountRow[]): {
  differences: number;
  glGreater: number;
  glLower: number;
  grossDifferenceMinor: string;
  largestDifferenceMinor: string;
  largestAccountId: string | null;
} {
  let gross = 0n;
  let largest = 0n;
  let largestAccountId: string | null = null;
  let positive = 0;
  let negative = 0;
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.accountId)) throw new Error("Duplicate reconciliation GL account.");
    seen.add(row.accountId);
    const variance = exactMinor(row.differenceMinor);
    if ((variance === 0n ? "matched" : "variance") !== row.status) {
      throw new Error("Reconciliation account status does not match its variance.");
    }
    if (variance > 0n) positive++;
    if (variance < 0n) negative++;
    const size = abs(variance);
    gross += size;
    if (size > largest) {
      largest = size;
      largestAccountId = row.accountId;
    }
  }
  return {
    differences: positive + negative,
    glGreater: positive,
    glLower: negative,
    grossDifferenceMinor: gross.toString(),
    largestDifferenceMinor: largest.toString(),
    largestAccountId,
  };
}

/** Selects fully authorised report rows only; never changes or saves the GL. */
export function selectReconciliationReviewRows(
  rows: readonly ReconciliationAccountRow[],
  filters: ReconciliationReviewFilters,
): ReconciliationAccountRow[] {
  const query = filters.query.trim().toLocaleLowerCase("en-US");
  return rows
    .filter((row) => {
      if (filters.status !== "all" && row.status !== filters.status) return false;
      return (
        !query ||
        row.accountCode.toLocaleLowerCase("en-US").includes(query) ||
        row.accountName.toLocaleLowerCase("en-US").includes(query)
      );
    })
    .sort((a, b) => {
      if (filters.order === "largest_difference") {
        const diffA = abs(exactMinor(a.differenceMinor));
        const diffB = abs(exactMinor(b.differenceMinor));
        if (diffA !== diffB) return diffA > diffB ? -1 : 1;
      }
      return a.accountCode.localeCompare(b.accountCode, undefined, { numeric: true });
    });
}

export function explainReconciliationDifference(differenceMinor: string): {
  heading: string;
  explanation: string;
} {
  const difference = exactMinor(differenceMinor);
  if (difference === 0n) {
    return {
      heading: "Register and posted GL agree at this account.",
      explanation:
        "A match does not prove all acquisitions and disposals were registered. Review other accounts as necessary.",
    };
  }
  if (difference > 0n) {
    return {
      heading: "Posted GL net debit is greater than the register net.",
      explanation:
        "Review unregistered capital purchases, opening balances, direct journals, asset mapping and disposals. This is a possible source, not a proven cause.",
    };
  }
  return {
    heading: "Posted GL net debit is lower than the register net.",
    explanation:
      "Review missing reversals, depreciation postings, different GL account mappings, disposal entries and adjustments. This is a possible source, not a proven cause.",
  };
}
