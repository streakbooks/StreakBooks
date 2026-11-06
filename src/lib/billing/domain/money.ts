/**
 * Exact money arithmetic for SaaS billing.
 *
 * Amounts are bigint minor units. Currency exponents come from ISO 4217 reference data
 * (0, 2, 3 or 4 decimals), not from a partial table. Exchange rates and factors are decimal
 * strings and are applied with integer arithmetic, so no IEEE float ever touches an amount.
 * Rounding is always explicit.
 */
import { ISO_CURRENCIES } from "@/lib/billing/reference/iso-reference-data";

export type RoundingMode = "HALF_UP" | "HALF_EVEN" | "UP" | "DOWN";

const minorUnitsByCode = new Map(ISO_CURRENCIES.map((c) => [c.code, c.minorUnits]));
const DECIMAL = /^(-)?(\d+)(?:\.(\d+))?$/;

export function isKnownCurrency(code: string): boolean {
  return minorUnitsByCode.has(code.trim().toUpperCase());
}

/** ISO 4217 exponent; throws for codes that are not active ISO billing currencies. */
export function currencyMinorUnits(code: string): number {
  const units = minorUnitsByCode.get(code.trim().toUpperCase());
  if (units === undefined) throw new Error(`Unsupported currency: ${code}`);
  return units;
}

/** Integer division with an explicit rounding mode. */
export function divideRounded(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  if (denominator === 0n) throw new Error("Division by zero");
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = n / d;
  const remainder = n % d;
  let rounded = quotient;
  if (remainder !== 0n) {
    const twice = remainder * 2n;
    switch (mode) {
      case "DOWN":
        break;
      case "UP":
        rounded += 1n;
        break;
      case "HALF_UP":
        if (twice >= d) rounded += 1n;
        break;
      case "HALF_EVEN":
        if (twice > d || (twice === d && quotient % 2n === 1n)) rounded += 1n;
        break;
    }
  }
  return negative ? -rounded : rounded;
}

/** Parses a non-negative or negative decimal string into an exact numerator/scale pair. */
export function parseDecimal(value: string): { numerator: bigint; scale: number } {
  const match = DECIMAL.exec(value.trim());
  if (!match) throw new Error(`Invalid decimal: ${value}`);
  const [, sign, whole, fraction = ""] = match;
  const digits = BigInt(`${whole}${fraction}`);
  return { numerator: sign ? -digits : digits, scale: fraction.length };
}

/**
 * Converts a display amount ("499", "12.345") into minor units. Excess precision is rejected
 * unless a rounding mode is supplied, so a typo can never silently change a price.
 */
export function parseAmountToMinor(
  value: string,
  currency: string,
  rounding?: RoundingMode,
): bigint {
  const units = currencyMinorUnits(currency);
  const { numerator, scale } = parseDecimal(value);
  if (scale <= units) return numerator * 10n ** BigInt(units - scale);
  if (!rounding) throw new Error(`${currency} allows at most ${units} decimal places`);
  return divideRounded(numerator, 10n ** BigInt(scale - units), rounding);
}

/** Exact decimal string for a minor-unit amount, e.g. 49900n INR -> "499.00". */
export function minorToDecimalString(amount: bigint, currency: string): string {
  const units = currencyMinorUnits(currency);
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  if (units === 0) return `${negative ? "-" : ""}${abs}`;
  const scale = 10n ** BigInt(units);
  const body = `${abs / scale}.${(abs % scale).toString().padStart(units, "0")}`;
  return negative ? `-${body}` : body;
}

/** Multiplies a minor-unit amount by an exact decimal factor (e.g. "1.025" markup). */
export function multiplyByDecimal(amount: bigint, factor: string, rounding: RoundingMode): bigint {
  const { numerator, scale } = parseDecimal(factor);
  return divideRounded(amount * numerator, 10n ** BigInt(scale), rounding);
}

/**
 * Converts an amount between currencies with an exact rate string (units of `to` per one unit
 * of `from`): result = amount * rate * 10^(toUnits - fromUnits), rounded once.
 */
export function convertMinorAmount(
  amount: bigint,
  from: string,
  to: string,
  rate: string,
  rounding: RoundingMode,
): bigint {
  const { numerator, scale } = parseDecimal(rate);
  if (numerator <= 0n) throw new Error("Exchange rate must be positive");
  const shift = currencyMinorUnits(to) - currencyMinorUnits(from);
  let top = amount * numerator;
  let bottom = 10n ** BigInt(scale);
  if (shift >= 0) top *= 10n ** BigInt(shift);
  else bottom *= 10n ** BigInt(-shift);
  return divideRounded(top, bottom, rounding);
}

/** Display only. Uses the exact decimal string so large amounts never pass through a float. */
export function formatMinorAmount(amount: bigint, currency: string, locale = "en"): string {
  const units = currencyMinorUnits(currency);
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: units,
    maximumFractionDigits: units,
  });
  return formatter.format(minorToDecimalString(amount, currency) as unknown as number);
}
