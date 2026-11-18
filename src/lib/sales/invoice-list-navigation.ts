import { initialListState, type ListState } from "@/lib/sales/list-state";

/** Validated URL state for the Sales invoices workspace. */
export type InvoiceListSearch = {
  q?: string | undefined;
  status?: "all" | "draft" | "authorised" | "partly_paid" | "paid" | "void" | undefined;
  from?: string | undefined;
  to?: string | undefined;
  sort?: "invoice_date" | "due_date" | "invoice_number" | "total_minor" | "status" | undefined;
  dir?: "asc" | "desc" | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
  overdue?: boolean | undefined;
};

const STATUSES = new Set(["all", "draft", "authorised", "partly_paid", "paid", "void"]);
const SORT_FIELDS = new Set([
  "invoice_date",
  "due_date",
  "invoice_number",
  "total_minor",
  "status",
]);
const PAGE_SIZES = new Set([25, 50, 100, 200]);
const QUERY_KEYS: ReadonlyArray<keyof InvoiceListSearch> = [
  "q",
  "status",
  "from",
  "to",
  "sort",
  "dir",
  "page",
  "pageSize",
  "overdue",
];
const MAX_CONTEXT_LENGTH = 2048;

/** Reject arbitrary keys, unbounded values, and invalid enum/date parameters. */
export function parseInvoiceListSearch(raw: Record<string, unknown>): InvoiceListSearch {
  const out: InvoiceListSearch = {};
  const q = raw["q"];
  if (typeof q === "string" && q.length > 0 && q.length <= 100) out.q = q;
  const status = raw["status"];
  if (typeof status === "string" && STATUSES.has(status))
    out.status = status as NonNullable<InvoiceListSearch["status"]>;
  for (const key of ["from", "to"] as const) {
    const value = raw[key];
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) out[key] = value;
  }
  const sort = raw["sort"];
  if (typeof sort === "string" && SORT_FIELDS.has(sort))
    out.sort = sort as NonNullable<InvoiceListSearch["sort"]>;
  if (raw["dir"] === "asc" || raw["dir"] === "desc") out.dir = raw["dir"];
  const page = raw["page"];
  if (
    (typeof page === "number" && Number.isSafeInteger(page) && page >= 0) ||
    (typeof page === "string" && /^\d{1,7}$/.test(page))
  )
    out.page = Math.min(Number(page), 1_000_000);
  const size = raw["pageSize"];
  if ((typeof size === "number" || typeof size === "string") && PAGE_SIZES.has(Number(size)))
    out.pageSize = Number(size);
  if (raw["overdue"] === true || raw["overdue"] === "true" || raw["overdue"] === "1")
    out.overdue = true;
  return out;
}

export function invoiceListStateFromSearch(search: InvoiceListSearch): ListState {
  const { overdue: _overdue, ...list } = search;
  void _overdue;
  const defaults = initialListState("invoice_date");
  return {
    q: list.q ?? defaults.q,
    status: list.status ?? defaults.status,
    from: list.from ?? defaults.from,
    to: list.to ?? defaults.to,
    sort: list.sort ?? defaults.sort,
    dir: list.dir ?? defaults.dir,
    page: list.page ?? defaults.page,
    pageSize: list.pageSize ?? defaults.pageSize,
  };
}

/** Keep only validated workspace fields; a return token is never a redirect URL. */
export function encodeInvoiceReturnContext(search: InvoiceListSearch): string {
  const params = new URLSearchParams();
  const validated = parseInvoiceListSearch(search);
  for (const key of QUERY_KEYS) {
    const value = validated[key];
    if (value === undefined || value === false || value === "") continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded.length <= MAX_CONTEXT_LENGTH ? encoded : "";
}

export function decodeInvoiceReturnContext(value: unknown): InvoiceListSearch {
  if (typeof value !== "string" || !value || value.length > MAX_CONTEXT_LENGTH) return {};
  return parseInvoiceListSearch(Object.fromEntries(new URLSearchParams(value)));
}
