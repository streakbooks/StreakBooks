import { DEFAULT_CURRENCY_DECIMALS, decimalPlacesFor } from "@/lib/accounting/money";
import { sanitiseSearchTerm } from "@/lib/search/sanitise";

export type MoneySearch = {
  decimal: string;
  currency?: string;
  sign: "both" | "positive" | "negative";
};

/** A complete monetary input, never a date, invoice number, or free text. */
export function parseMoneySearch(input: string): MoneySearch | null {
  let s = input.trim();
  if (!s) return null;
  let sign: MoneySearch["sign"] = "both";
  if (s[0] === "-" || s[0] === "+") {
    sign = s[0] === "-" ? "negative" : "positive";
    s = s.slice(1).trim();
  }
  let currency: string | undefined;
  const currencyPrefix = /^([A-Za-z]{3})\s+/.exec(s);
  if (currencyPrefix) {
    currency = currencyPrefix[1]!.toUpperCase();
    s = s.slice(currencyPrefix[0].length).trim();
  }
  const symbol = /^([$£€₹¥])\s*/.exec(s);
  if (symbol) {
    const symbolCode: Record<string, string | undefined> = {
      "£": "GBP", "€": "EUR", "₹": "INR", "¥": "JPY",
      "$": undefined, // "$" is shared by many currencies, not just USD.
    };
    const code = symbolCode[symbol[1]!];
    if (currency && code && currency !== code) return null;
    currency ??= code;
    s = s.slice(symbol[0].length).trim();
  }
  if ((s[0] === "-" || s[0] === "+") && sign === "both") {
    sign = s[0] === "-" ? "negative" : "positive";
    s = s.slice(1).trim();
  }
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,3}(?:,\d{2})*,\d{3})(?:\.\d{1,3})?$/.test(s)) return null;
  return { decimal: s.replace(/,/g, ""), sign, ...(currency ? { currency } : {}) };
}

/** Exact currency-aware conversion; never round the user's search input. */
export function minorAmountForCurrency(query: MoneySearch, code: string): number | null {
  if (query.currency && query.currency !== code.toUpperCase()) return null;
  const places = decimalPlacesFor(code);
  const [whole = "", fraction = ""] = query.decimal.split(".");
  if (fraction.length > places && /[1-9]/.test(fraction.slice(places))) return null;
  const minor = BigInt(whole) * 10n ** BigInt(places) +
    BigInt((fraction + "0".repeat(places)).slice(0, places) || "0");
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null;
}

/** PostgREST OR expression matching currency and amount together. */
export function documentMoneyFilter(query: MoneySearch, amountColumn = "total_minor"): string {
  if (query.currency) {
    const minor = minorAmountForCurrency(query, query.currency);
    return minor === null ? "" : "and(currency_code.eq." + query.currency + "," + amountColumn + ".eq." + minor + ")";
  }
  const exceptions = Object.entries(DEFAULT_CURRENCY_DECIMALS)
    .filter(([, places]) => places !== 2);
  const clauses: string[] = [];
  const defaultMinor = minorAmountForCurrency(query, "GBP");
  if (defaultMinor !== null) {
    const excluded = exceptions.map(([code]) => code);
    const currencyFilter = excluded.length
      ? "currency_code.not.in.(" + excluded.join(",") + ")"
      : "currency_code.not.is.null";
    clauses.push("and(" + currencyFilter + "," + amountColumn + ".eq." + defaultMinor + ")");
  }
  for (const [code] of exceptions) {
    const minor = minorAmountForCurrency(query, code);
    if (minor !== null) clauses.push("and(currency_code.eq." + code + "," + amountColumn + ".eq." + minor + ")");
  }
  return clauses.join(",");
}

/** Bank transaction amounts are scoped by the linked bank account's actual currency. */
export function bankMoneyFilter(
  query: MoneySearch,
  accounts: readonly { id: string; currency_code: string }[],
): string {
  const groups = new Map<number, string[]>();
  for (const account of accounts) {
    const amount = minorAmountForCurrency(query, account.currency_code);
    if (amount === null) continue;
    const existing = groups.get(amount) ?? [];
    existing.push(account.id);
    groups.set(amount, existing);
  }
  return [...groups].map(([amount, ids]) => {
    const signed = query.sign === "both"
      ? [...new Set([amount, -amount])]
      : [query.sign === "negative" ? -amount : amount];
    return "and(bank_account_id.in.(" + ids.join(",") + "),amount_minor.in.(" + signed.join(",") + "))";
  }).join(",");
}

export function searchDate(input: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const date = new Date(input + "T00:00:00.000Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === input ? input : null;
}

/** Text and date search never invents fuzzy numeric amount predicates. */
export function searchOrFilter(
  fields: readonly string[],
  input: string,
  options: { dateFields?: readonly string[] } = {},
): string {
  const safe = sanitiseSearchTerm(input);
  const predicates = safe.length >= 2 ? fields.map((f) => f + '.ilike."%' + safe + '%"') : [];
  const date = searchDate(input.trim());
  if (date) for (const f of options.dateFields ?? []) predicates.push(f + ".eq." + date);
  return predicates.join(",");
}
