import { convertMinorToBase } from "@/lib/accounting/fx";

/**
 * Aged Payables as-at dates may be historical when dated allocation history is available.
 * Future dates remain unsupported because outstanding cannot be projected forward.
 */
export function assertPayablesAsOfNotFuture(asOf: string, companyToday: string): void {
  if (asOf > companyToday) {
    throw new Error(
      `Aged Payables cannot use a future as-at date. Choose ${companyToday} or an earlier date.`,
    );
  }
}

/**
 * @deprecated Prefer assertPayablesAsOfNotFuture. Historical dates are supported by
 * getAgedPayablesAsAt; this helper remains only for callers that still use current counters.
 */
export function assertCurrentPayablesDate(asOf: string, companyToday: string): void {
  assertPayablesAsOfNotFuture(asOf, companyToday);
}

export function payableOutstandingInBase(
  outstanding: bigint,
  currency: string,
  baseCurrency: string,
  rate: string | number | null,
): bigint {
  if (currency.toUpperCase() === baseCurrency.toUpperCase() || outstanding === 0n)
    return outstanding;
  if (rate === null)
    throw new Error(
      `A foreign-currency bill has no posted exchange rate for ${currency} to ${baseCurrency}; reporting cannot treat it as base currency.`,
    );
  return convertMinorToBase(outstanding, rate, currency, baseCurrency);
}
