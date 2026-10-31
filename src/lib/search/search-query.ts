import { sanitiseSearchTerm } from "@/lib/search/sanitise";

/**
 * Translate a literal monetary search into integer minor-unit values.
 * 0, 2 and 3 decimal currencies are supported without floating-point maths.
 * A positive value can match outgoing bank transactions by absolute amount.
 */
export function minorAmountCandidates(input: string): number[] {
  const value = input.trim()
    .replace(/\b(?:USD|GBP|EUR|INR|AUD|NZD|CAD|JPY|KWD|BHD|OMR|AED|CHF|SGD)\b/gi, "")
    .replace(/[$£€₹¥]/g, "")
    .trim();
  const sign = value.startsWith("-") ? -1n : 1n;
  const unsigned = value.replace(/^[+-]/, "");
  const valid = /^(?:\d+(?:\.\d{1,3})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,3})?|\d{1,3}(?:,\d{2})*,\d{3}(?:\.\d{1,3})?)$/;
  if (!valid.test(unsigned)) return [];

  const [whole, fraction = ""] = unsigned.replace(/,/g, "").split(".");
  const out = new Set<number>();
  for (const decimals of [0, 2, 3]) {
    if (fraction.length > decimals && /[1-9]/.test(fraction.slice(decimals))) continue;
    const factor = 10n ** BigInt(decimals);
    const fractional = (fraction + "0".repeat(decimals)).slice(0, decimals);
    const minor = sign * (BigInt(whole!) * factor + BigInt(fractional || "0"));
    if (minor <= BigInt(Number.MAX_SAFE_INTEGER) && minor >= BigInt(Number.MIN_SAFE_INTEGER)) {
      out.add(Number(minor));
    }
  }
  return [...out];
}

export function searchDate(input: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const date = new Date(input + "T00:00:00.000Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === input ? input : null;
}

/** Build a PostgREST OR filter. Caller must separately constrain company_id and rely on RLS. */
export function searchOrFilter(
  fields: readonly string[],
  input: string,
  options: { amountField?: string; dateFields?: readonly string[]; bankAmount?: boolean } = {},
): string {
  const safe = sanitiseSearchTerm(input);
  const predicates = safe.length >= 2 ? fields.map((f) => f + '.ilike."%' + safe + '%"') : [];
  if (options.amountField) {
    const amounts = minorAmountCandidates(input);
    const values = new Set(amounts);
    if (options.bankAmount && !input.trim().startsWith("-")) {
      for (const n of amounts) values.add(-n);
    }
    for (const n of values) predicates.push(options.amountField + ".eq." + n);
  }
  const date = searchDate(input.trim());
  if (date) {
    for (const f of options.dateFields ?? []) predicates.push(f + ".eq." + date);
  }
  return predicates.join(",");
}
