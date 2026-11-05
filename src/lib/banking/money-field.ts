import { tryParseMinor, type MoneyInputOptions } from "./money-input";
/** Parse a MoneyField value to minor units (null when empty or invalid). */
export function moneyFieldMinor(
  value: string,
  currency: string,
  options?: MoneyInputOptions,
): bigint | null {
  if (!value.trim()) return null;
  return tryParseMinor(value, currency, options);
}
