/** Strict, shared input checks for tax configuration and return period requests. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Reject calendar-impossible dates (e.g. 2026-02-29), not only malformed text. */
export function isValidTaxDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const timestamp = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value;
}

/**
 * Rates are stored in integral basis points (1 bp = 0.01 percentage points).
 * Do not round hidden extra decimal places: request a precise user correction.
 */
export function percentToTaxBasisPoints(value: string): number {
  const text = value.trim();
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(text)) return NaN;
  const [whole, fraction = ""] = text.split(".");
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return bps <= 10000 ? bps : NaN;
}

export function isValidTaxBasisPoints(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isInteger(value) && value >= 0 && value <= 10000;
}

export type TaxReturnBasis = "cash" | "accrual";

export function validateTaxReturnPeriod(input: {
  periodStart: unknown;
  periodEnd: unknown;
  basis?: unknown;
}): { periodStart: string; periodEnd: string; basis: TaxReturnBasis } {
  const { periodStart, periodEnd } = input;
  if (!isValidTaxDate(periodStart)) {
    throw new Error("Period start must be a real calendar date in YYYY-MM-DD format.");
  }
  if (!isValidTaxDate(periodEnd)) {
    throw new Error("Period end must be a real calendar date in YYYY-MM-DD format.");
  }
  if (periodStart > periodEnd) {
    throw new Error("The period cannot end before it starts.");
  }
  const rawBasis = input.basis ?? "accrual";
  if (rawBasis !== "cash" && rawBasis !== "accrual") {
    throw new Error("Tax return basis must be cash or accrual.");
  }
  return { periodStart, periodEnd, basis: rawBasis };
}
