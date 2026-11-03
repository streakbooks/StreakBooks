/**
 * Account Transactions presentation and server-side filters.
 * These operations NEVER recalculate a filtered running balance. Running balances are
 * computed over every posted entry in journal order before rows are filtered/sorted.
 */
export const TRANSACTION_COLUMNS = [
  { id: "date", label: "Date" },
  { id: "accountCode", label: "Account code" },
  { id: "accountName", label: "Account name" },
  { id: "journal", label: "Journal #" },
  { id: "journalId", label: "Journal ID" },
  { id: "lineId", label: "Line ID" },
  { id: "source", label: "Transaction type" },
  { id: "sourceId", label: "Source record ID" },
  { id: "lineNo", label: "Journal line #" },
  { id: "transactionCurrency", label: "Transaction currency" },
  { id: "fxRate", label: "Exchange rate to base" },
  { id: "postedAt", label: "Posted at" },
  { id: "postedBy", label: "Posted by (ID)" },
  { id: "createdBy", label: "Created by (ID)" },
  { id: "memo", label: "Journal memo" },
  { id: "description", label: "Line description" },
  { id: "debit", label: "Debit" },
  { id: "credit", label: "Credit" },
  { id: "net", label: "Net movement" },
  { id: "balance", label: "Running balance" },
  { id: "currency", label: "Base currency" },
  { id: "status", label: "Posting status" },
] as const;

export type TransactionColumn = (typeof TRANSACTION_COLUMNS)[number]["id"];
export const DEFAULT_TRANSACTION_COLUMNS: TransactionColumn[] = [
  "date",
  "journal",
  "source",
  "memo",
  "debit",
  "credit",
  "balance",
];
const VALID_COLUMNS = new Set<string>(TRANSACTION_COLUMNS.map((column) => column.id));
export function parseTransactionColumns(value: unknown): TransactionColumn[] {
  if (typeof value !== "string" || !value.trim()) return [...DEFAULT_TRANSACTION_COLUMNS];
  const columns = [...new Set(value.split(",").map((item) => item.trim()))].filter((item) =>
    VALID_COLUMNS.has(item),
  ) as TransactionColumn[];
  return columns.length ? columns : [...DEFAULT_TRANSACTION_COLUMNS];
}

export type TransactionSort = "date_asc" | "date_desc" | "amount_asc" | "amount_desc";
export type TransactionFlow = "all" | "debit" | "credit";
export type TransactionFilter = {
  source?: string;
  query?: string;
  flow?: TransactionFlow;
  sort?: TransactionSort;
  minAmountMinor?: bigint | undefined;
  maxAmountMinor?: bigint | undefined;
};

export type FilterableTransactionRow = {
  journal_date: string;
  journal_number: number;
  journal_id: string;
  line_id: string;
  source_type: string;
  source_id: string | null;
  memo: string | null;
  description: string | null;
  debit_minor: number | bigint;
  credit_minor: number | bigint;
  running_balance_minor: number | bigint;
};

function amount(row: FilterableTransactionRow): bigint {
  const net = BigInt(row.debit_minor) - BigInt(row.credit_minor);
  return net < 0n ? -net : net;
}

/** Filter against posted rows; keep original ledger-derived running balances unchanged. */
export function filterTransactionRows<T extends FilterableTransactionRow>(
  rows: readonly T[],
  filters: TransactionFilter,
): T[] {
  const query = (filters.query ?? "").trim().toLocaleLowerCase();
  const source = filters.source ?? "";
  const flow = filters.flow ?? "all";
  const sort = filters.sort ?? "date_asc";
  const matched = rows.filter((row) => {
    if (source && row.source_type !== source) return false;
    if (flow === "debit" && BigInt(row.debit_minor) <= 0n) return false;
    if (flow === "credit" && BigInt(row.credit_minor) <= 0n) return false;
    const movement = amount(row);
    if (filters.minAmountMinor != null && movement < filters.minAmountMinor) return false;
    if (filters.maxAmountMinor != null && movement > filters.maxAmountMinor) return false;
    if (!query) return true;
    return [
      row.memo,
      row.description,
      row.source_type,
      row.source_id,
      row.journal_id,
      String(row.journal_number),
    ].some((part) => (part ?? "").toLocaleLowerCase().includes(query));
  });
  if (sort === "date_asc") return matched;
  const sorted = [...matched];
  if (sort === "date_desc") {
    sorted.reverse();
  } else {
    sorted.sort((a, b) => {
      const left = amount(a);
      const right = amount(b);
      return left === right ? 0 : (left < right ? -1 : 1) * (sort === "amount_desc" ? -1 : 1);
    });
  }
  return sorted;
}
