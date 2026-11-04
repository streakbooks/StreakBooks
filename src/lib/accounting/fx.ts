/**
 * Multi-currency helpers per docs/settings-fx-firm/FX_ACCOUNTING_POLICY.md.
 * Rates are never mutated after insert; journals snapshot fx_rate_to_base at post.
 */

import { decimalPlacesFor } from "@/lib/accounting/money";

/** Never turn a rounded JS Number into a purportedly exact ledger amount. */
function exactMinor(value: bigint | number): bigint {
  if (typeof value === "bigint") return value;
  if (!Number.isSafeInteger(value)) {
    throw new Error("Financial amount is not a safe integer in minor units");
  }
  return BigInt(value);
}

/** Half-up rounding of a non-negative rational (numerator/denominator) to bigint. */
export function roundHalfUpRational(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("denominator must be positive");
  const negative = numerator < 0n;
  const n = negative ? -numerator : numerator;
  const q = n / denominator;
  const r = n % denominator;
  // round half up: if 2*r >= denominator, round away from zero
  const rounded = r * 2n >= denominator ? q + 1n : q;
  return negative ? -rounded : rounded;
}

/** Multiply minor units by a decimal rate with half-up rounding (same decimal places). */
export function scaleMinorByRate(txnMinor: bigint | number, rate: number | string): bigint {
  const minor = exactMinor(txnMinor);
  const rateStr = String(rate).trim();
  if (!/^\d+(\.\d+)?$/.test(rateStr) || Number(rateStr) <= 0) {
    throw new Error("fx rate must be a positive decimal");
  }
  if (rateStr === "1" || rateStr === "1.0" || rateStr === "1.00") return minor;
  const [rw, rf = ""] = rateStr.split(".");
  const rateScale = BigInt(rf.length);
  const rateInt = BigInt((rw ?? "0") + rf);
  return roundHalfUpRational(minor * rateInt, 10n ** rateScale);
}

/**
 * Convert transaction-currency minor units to base-currency minor units.
 * `rate` = units of base per 1 unit of transaction currency (fx_rate_to_base).
 *
 * Decimal-aware and single-rounding: base_minor = round(minor * rate * 10^(baseDp - txnDp)).
 * (Rounding once at the end, not before the decimal-place shift, so JPY 1000 @ 0.0067 USD
 * is 670 cents, not 700.) Identical to the SQL used by public.ledger_balances.
 */
export function convertMinorToBase(
  txnMinor: bigint | number,
  rate: number | string,
  txnCurrency: string,
  baseCurrency: string,
): bigint {
  const minor = exactMinor(txnMinor);
  if (txnCurrency.toUpperCase() === baseCurrency.toUpperCase()) return minor;
  const rateStr = String(rate).trim();
  if (!/^\d+(\.\d+)?$/.test(rateStr) || Number(rateStr) <= 0) {
    throw new Error("fx rate must be a positive decimal");
  }
  const [rw, rf = ""] = rateStr.split(".");
  const rateInt = BigInt((rw ?? "0") + rf);
  let denominator = 10n ** BigInt(rf.length);
  let numerator = minor * rateInt;
  const shift = decimalPlacesFor(baseCurrency) - decimalPlacesFor(txnCurrency);
  if (shift > 0) numerator *= 10n ** BigInt(shift);
  else if (shift < 0) denominator *= 10n ** BigInt(-shift);
  return roundHalfUpRational(numerator, denominator);
}

/** Realised FX on settling `settledTxnMinor` originally booked at `originalRate`, settled at `settleRate`. */
export function computeRealizedFx(
  settledTxnMinor: bigint | number,
  originalRate: number | string,
  settleRate: number | string,
  txnCurrency: string,
  baseCurrency: string,
): { gainLossBaseMinor: bigint; originalBase: bigint; settleBase: bigint } {
  const originalBase = convertMinorToBase(settledTxnMinor, originalRate, txnCurrency, baseCurrency);
  const settleBase = convertMinorToBase(settledTxnMinor, settleRate, txnCurrency, baseCurrency);
  return {
    gainLossBaseMinor: settleBase - originalBase,
    originalBase,
    settleBase,
  };
}

export type OpenForeignBalance = {
  account_id: string;
  currency_code: string;
  /** Net debit−credit in transaction currency minor units */
  txn_net_minor: bigint;
  /** Booked base equivalent using historical journal rates (sum of converted lines) */
  booked_base_minor: bigint;
};

/** Unrealised FX = closing_base − booked_base for open foreign balances. */
export function computeUnrealizedFx(
  balances: OpenForeignBalance[],
  closingRates: Map<string, number | string>,
  baseCurrency: string,
): {
  totalGainLossBaseMinor: bigint;
  lines: Array<{ account_id: string; currency_code: string; gainLossBaseMinor: bigint }>;
} {
  const lines: Array<{ account_id: string; currency_code: string; gainLossBaseMinor: bigint }> = [];
  let total = 0n;
  for (const b of balances) {
    if (b.currency_code.toUpperCase() === baseCurrency.toUpperCase()) continue;
    const rate = closingRates.get(b.currency_code.toUpperCase());
    if (rate == null) throw new Error(`Missing closing rate for ${b.currency_code}`);
    const closingBase = convertMinorToBase(b.txn_net_minor, rate, b.currency_code, baseCurrency);
    const gainLoss = closingBase - b.booked_base_minor;
    lines.push({
      account_id: b.account_id,
      currency_code: b.currency_code,
      gainLossBaseMinor: gainLoss,
    });
    total += gainLoss;
  }
  return { totalGainLossBaseMinor: total, lines };
}

/**
 * Apply the journal snapshot rate to convert a posted line amount to base for reporting.
 * When both currencies are known this is the decimal-aware converter (RP-07).
 * Missing snapshots for known foreign currencies are errors, not 1:1 conversions.
 * Legacy callers without currency metadata retain the original plain-rate path.
 */
export function lineToBaseMinor(
  amountMinor: bigint | number,
  fxRateToBase: number | string | null | undefined,
  txnCurrency?: string | null,
  baseCurrency?: string | null,
): bigint {
  const minor = exactMinor(amountMinor);
  if (txnCurrency && baseCurrency && txnCurrency.toUpperCase() === baseCurrency.toUpperCase()) {
    return minor;
  }
  if (fxRateToBase == null) {
    if (txnCurrency && baseCurrency && txnCurrency.toUpperCase() !== baseCurrency.toUpperCase()) {
      throw new Error(
        `Missing posted exchange-rate snapshot for ${txnCurrency.toUpperCase()} to ${baseCurrency.toUpperCase()}`,
      );
    }
    // Legacy records without a declared transaction currency are base-currency
    // amounts. A foreign currency with no rate is never assumed to be 1:1.
    return minor;
  }
  if (txnCurrency && baseCurrency) {
    return convertMinorToBase(minor, fxRateToBase, txnCurrency, baseCurrency);
  }
  return scaleMinorByRate(minor, fxRateToBase);
}
