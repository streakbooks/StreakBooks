/**
 * Preserve the authorised Bills workspace's filter/sort/page context when users
 * open a bill, visit related records and return to the list. The return value is
 * query parameters, never a URL or a redirect destination.
 */
export type BillsReturnContext = {
  tab?: "all" | "drafts" | "for_approval" | "to_pay" | "paid" | "recurring";
  q?: string;
  from?: string;
  to?: string;
  dateField?: "bill_date" | "due_date";
  includeVoid?: boolean;
  overdueOnly?: boolean;
  status?: string;
  page?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
};

const TABS = new Set(["all", "drafts", "for_approval", "to_pay", "paid", "recurring"]);
const STATUSES = new Set(["draft", "awaiting_approval", "authorised", "partly_paid", "paid", "void"]);
const SORT_KEYS = new Set(["bill_date", "due_date", "total_minor", "status", "bill_number"]);
const KEYS: Array<keyof BillsReturnContext> = [
  "tab", "q", "from", "to", "dateField", "includeVoid", "overdueOnly",
  "status", "page", "sortBy", "sortDir",
];
const MAX_LENGTH = 2048;

/** Validate explicit allowlisted fields, not arbitrary URLs or query keys. */
export function decodeBillsReturnContext(raw: unknown): BillsReturnContext {
  if (typeof raw !== "string" || raw.length > MAX_LENGTH || !raw) return {};
  const p = new URLSearchParams(raw);
  const out: BillsReturnContext = {};
  const tab = p.get("tab");
  if (tab && TABS.has(tab))
    out.tab = tab as "all" | "drafts" | "for_approval" | "to_pay" | "paid" | "recurring";
  const q = p.get("q");
  if (q && q.length <= 100) out.q = q;
  for (const key of ["from", "to"] as const) {
    const date = p.get(key);
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) out[key] = date;
  }
  const dateField = p.get("dateField");
  if (dateField === "bill_date" || dateField === "due_date") out.dateField = dateField;
  for (const key of ["includeVoid", "overdueOnly"] as const) {
    const value = p.get(key);
    if (value === "true" || value === "1") out[key] = true;
  }
  const status = p.get("status");
  if (status && STATUSES.has(status)) out.status = status;
  const page = p.get("page");
  if (page && /^\d{1,7}$/.test(page)) out.page = Math.min(Number(page), 1_000_000);
  const sortBy = p.get("sortBy");
  if (sortBy && SORT_KEYS.has(sortBy)) out.sortBy = sortBy;
  const sortDir = p.get("sortDir");
  if (sortDir === "asc" || sortDir === "desc") out.sortDir = sortDir;
  return out;
}

/** Avoid storing user-controlled navigation destinations or irrelevant filters. */
export function encodeBillsReturnContext(context: BillsReturnContext): string {
  const params = new URLSearchParams();
  for (const key of KEYS) {
    const value = context[key];
    if (value === undefined || value === "" || value === false) continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  // Apply the exact same validation rules on both outbound and return links.
  if (encoded.length > MAX_LENGTH) return "";
  const canonical = new URLSearchParams();
  const validated = decodeBillsReturnContext(encoded);
  for (const key of KEYS) {
    const value = validated[key];
    if (value !== undefined) canonical.set(key, String(value));
  }
  return canonical.toString();
}
