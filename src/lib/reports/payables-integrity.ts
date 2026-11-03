import { convertMinorToBase } from "@/lib/accounting/fx";

/** Current paid/credited counters cannot reconstruct deleted or reversed past allocations. */
export function assertCurrentPayablesDate(asOf: string, companyToday: string): void {
  if (asOf !== companyToday)
    throw new Error(
      `Historical Aged Payables is unavailable because dated payment and credit allocation history is not retained. Choose ${companyToday} for the current outstanding snapshot. Future dates are also unsupported.`,
    );
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
