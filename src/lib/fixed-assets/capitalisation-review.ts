import type { CapitaliseLine } from "./fixed-assets.functions";
import { fetchAllPages, type PageResult } from "@/lib/accounting/fetch-all";

/**
 * Posted asset-coded bill lines are REVIEW CANDIDATES, not proof of fixed asset purchases.
 * Amounts on foreign-currency bills cannot be compared to registered base-currency costs
 * without a verified historic FX allocation; never assume a match from nominal values.
 */
export type CapitalisationReviewStatus =
  | "unlinked"
  | "partially_linked"
  | "linked"
  | "fx_review"
  | "overlinked"
  | "non_purchase";

export type CapitalisationReviewRow = CapitaliseLine & {
  status: CapitalisationReviewStatus;
  /** Estimated gross less linked base-currency asset cost, not a ledger adjustment. */
  indicativeUnlinkedMinor: string | null;
};

export type CapitalisationReviewTotals = {
  candidates: number;
  unlinked: number;
  partiallyLinked: number;
  linked: number;
  fxReview: number;
  overlinked: number;
  nonPurchase: number;
};

const exact = (value: number, label: string): bigint => {
  if (!Number.isSafeInteger(value)) throw new Error(label + " is not an exact minor-unit integer");
  return BigInt(value);
};

export function reviewCapitalisableLines(
  lines: readonly CapitaliseLine[],
  baseCurrency: string,
): { rows: CapitalisationReviewRow[]; totals: CapitalisationReviewTotals } {
  const seen = new Set<string>();
  const rows = lines.map((line) => {
    if (seen.has(line.lineId)) throw new Error("Duplicate posted purchase bill line");
    seen.add(line.lineId);
    const net = exact(line.netMinor, "Bill line net");
    const tax = exact(line.taxMinor, "Bill line tax");
    const linked = exact(line.registeredMinor, "Registered asset cost");
    if (linked < 0n || tax < 0n) throw new Error("Invalid capitalisation amounts");
    const gross = net + tax;
    if (gross <= 0n) {
      // Credit/negative bill lines may require review; this isn't a purchase
      // eligible for capitalisation and must never be labelled "unlinked".
      return { ...line, status: "non_purchase" as const, indicativeUnlinkedMinor: null };
    }
    const sameCurrency = line.currency.toUpperCase() === baseCurrency.toUpperCase();
    let status: CapitalisationReviewStatus;
    if (linked === 0n) status = "unlinked";
    else if (!sameCurrency) status = "fx_review";
    else if (linked > gross) status = "overlinked";
    else if (linked < net) status = "partially_linked";
    else status = "linked";
    return {
      ...line,
      status,
      indicativeUnlinkedMinor: sameCurrency ? (gross - linked).toString() : null,
    };
  });
  const totals: CapitalisationReviewTotals = {
    candidates: rows.length,
    unlinked: rows.filter((r) => r.status === "unlinked").length,
    partiallyLinked: rows.filter((r) => r.status === "partially_linked").length,
    linked: rows.filter((r) => r.status === "linked").length,
    fxReview: rows.filter((r) => r.status === "fx_review").length,
    overlinked: rows.filter((r) => r.status === "overlinked").length,
    nonPurchase: rows.filter((r) => r.status === "non_purchase").length,
  };
  return { rows, totals };
}

export function selectCapitalisationReviewRows(
  rows: readonly CapitalisationReviewRow[],
  filter: {
    status: "attention" | "all" | CapitalisationReviewStatus;
    query: string;
    accountId: string;
  },
): CapitalisationReviewRow[] {
  const needle = filter.query.trim().toLocaleLowerCase();
  return rows
    .filter((row) => {
      if (filter.status === "attention" && row.status === "linked") return false;
      if (
        filter.status !== "all" &&
        filter.status !== "attention" &&
        row.status !== filter.status
      ) return false;
      if (filter.accountId && row.accountId !== filter.accountId) return false;
      if (!needle) return true;
      return [
        row.description,
        row.billNumber,
        row.supplier,
        row.accountCode,
        row.accountName,
        row.billDate,
      ]
        .some((part) => (part ?? "").toLocaleLowerCase().includes(needle));
    })
    .sort((a, b) => b.billDate.localeCompare(a.billDate) || b.lineId.localeCompare(a.lineId));
}

/** Spreadsheet-safe audit worksheet. All currency and precision metadata are explicit. */
export function capitalisationReviewCsv(
  rows: readonly CapitalisationReviewRow[],
  asOf: string,
  baseCurrency: string,
): string {
  const escapeCell = (value: string) => {
    const safe = /^\s*[=+@-]/.test(value) ? "'" + value : value;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  const headers = [
    "Bills through",
    "Bill number",
    "Bill ID",
    "Bill line ID",
    "Bill date",
    "Supplier",
    "Description",
    "GL account",
    "GL account name",
    "Bill currency",
    "Bill net minor units",
    "Bill tax minor units",
    "Registered base currency",
    "Registered base minor units",
    "Indicative unlinked gross minor units (same currency only)",
    "Review status",
  ];
  const lines = rows.map((r) => [
    asOf,
    r.billNumber ?? "",
    r.billId,
    r.lineId,
    r.billDate,
    r.supplier ?? "",
    r.description,
    r.accountCode,
    r.accountName,
    r.currency,
    String(r.netMinor),
    String(r.taxMinor),
    baseCurrency,
    String(r.registeredMinor),
    r.indicativeUnlinkedMinor ?? "",
    r.status,
  ].map(escapeCell).join(","));
  return [headers.map(escapeCell).join(","), ...lines].join("\r\n");
}

/** Whole-account coverage without the old 300-row cap or oversized .in URLs. */
export async function pageCapitalisationBillLines<T extends { id: string }>(
  accountIds: readonly string[],
  fetchPage: (accountChunk: string[], from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const all: T[] = [];
  const seen = new Set<string>();
  for (let offset = 0; offset < accountIds.length; offset += 50) {
    const ids = accountIds.slice(offset, offset + 50);
    const rows = await fetchAllPages<T>((from, to) => fetchPage(ids, from, to));
    for (const row of rows) {
      if (seen.has(row.id)) throw new Error("Duplicate asset-coded bill line in paginated results");
      seen.add(row.id);
      all.push(row);
    }
    if (all.length > 2_000_000) {
      throw new Error("Too many bill candidates to review safely. Narrow the search.");
    }
  }
  return all;
}
