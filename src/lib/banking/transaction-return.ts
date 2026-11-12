/**
 * Preserve banking-transaction filters when following a related journal.
 * Return state is an allowlisted query string, NEVER an external redirect URL.
 */
export type BankTransactionReturnSearch = {
  status?: "uncategorised" | "matched" | "reconciled" | "excluded" | "all";
  statusGroup?: "unreconciled" | "posted" | "all";
  bankAccountId?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  direction?: "in" | "out";
  page?: number;
  pageSize?: 25 | 50 | 100 | 200;
};

const STATUS = new Set(["uncategorised", "matched", "reconciled", "excluded", "all"]);
const GROUP = new Set(["unreconciled", "posted", "all"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIZES = new Set([25, 50, 100, 200]);
const KEYS: Array<keyof BankTransactionReturnSearch> = [
  "status", "statusGroup", "bankAccountId", "q",
  "dateFrom", "dateTo", "direction", "page", "pageSize",
];
const MAX_LENGTH = 2048;

export function parseBankTransactionReturnSearch(
  input: Record<string, unknown>,
): BankTransactionReturnSearch {
  const out: BankTransactionReturnSearch = {};
  if (typeof input["status"] === "string" && STATUS.has(input["status"])) {
    out.status = input["status"] as BankTransactionReturnSearch["status"];
  }
  if (typeof input["statusGroup"] === "string" && GROUP.has(input["statusGroup"])) {
    out.statusGroup = input["statusGroup"] as BankTransactionReturnSearch["statusGroup"];
  }
  const account = input["bankAccountId"];
  if (typeof account === "string" && UUID.test(account)) out.bankAccountId = account;
  const q = input["q"];
  if (typeof q === "string" && q.length > 0 && q.length <= 120) out.q = q;
  for (const key of ["dateFrom", "dateTo"] as const) {
    const value = input[key];
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) { 
      const [year, month, day] = value.split("-").map(Number);
      const date = new Date(0);
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCFullYear(year, month - 1, day);
      if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) out[key] = value;
    }
  }
  // An inverted range must not silently restore a misleading transaction list.
  // Keep the valid start date and discard the conflicting end date.
  if (out.dateFrom && out.dateTo && out.dateFrom > out.dateTo) {
    delete out.dateTo;
  }
  if (input["direction"] === "in" || input["direction"] === "out") {
    out.direction = input["direction"];
  }
  const page = input["page"];
  if (
    (typeof page === "number" && Number.isSafeInteger(page) && page >= 0) ||
    (typeof page === "string" && /^\d{1,7}$/.test(page))
  ) out.page = Math.min(Number(page), 1_000_000);
  const pageSize = input["pageSize"];
  // Accept only canonical page-size values. Number() alone also accepts padded,
  // whitespace and exponential strings, which should not survive a deep link.
  if ((typeof pageSize === "number" && Number.isInteger(pageSize) && SIZES.has(pageSize)) ||
      (typeof pageSize === "string" && /^(25|50|100|200)$/.test(pageSize))) {
    out.pageSize = Number(pageSize) as BankTransactionReturnSearch["pageSize"];
  }
  return out;
}

export function encodeBankTransactionReturnContext(input: Record<string, unknown>): string {
  const safe = parseBankTransactionReturnSearch(input);
  const p = new URLSearchParams();
  for (const key of KEYS) {
    const value = safe[key];
    if (value !== undefined && value !== "") p.set(key, String(value));
  }
  const token = p.toString();
  return token.length <= MAX_LENGTH ? token : "";
}

export function decodeBankTransactionReturnContext(raw: unknown): BankTransactionReturnSearch {
  if (typeof raw !== "string" || !raw || raw.length > MAX_LENGTH) return {};
  return parseBankTransactionReturnSearch(Object.fromEntries(new URLSearchParams(raw)));
}
