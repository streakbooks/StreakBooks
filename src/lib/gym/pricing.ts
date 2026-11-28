export const BILLING_INTERVALS = [
  "day",
  "week",
  "month",
  "quarter",
  "half_year",
  "year",
  "lifetime",
  "session",
  "custom",
] as const;

export type BillingInterval = (typeof BILLING_INTERVALS)[number];

function minor(amount: number, label: string, allowZero = false): number {
  if (!Number.isSafeInteger(amount) || amount < 0 || (!allowZero && amount === 0)) {
    throw new Error(`${label} must be a ${allowZero ? "non-negative" : "positive"} minor-unit integer`);
  }
  return amount;
}

/** Half-up tax from an organisation-configured rate in basis points. Not a statutory rate. */
export function taxFromBps(netMinor: number, bps: number): number {
  minor(netMinor, "Net", true);
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 10000) {
    throw new Error("Tax basis points must be between 0 and 10000");
  }
  const product = netMinor * bps;
  if (!Number.isSafeInteger(product)) throw new Error("Tax calculation is outside the safe integer range");
  return Math.floor((product + 5000) / 10000);
}

export type PricedContract = {
  membershipMinor: number;
  joiningFeeMinor: number;
  taxMinor: number;
  totalMinor: number;
};

export function priceContract(input: {
  membershipMinor: number;
  joiningFeeMinor: number;
  taxBps: number;
}): PricedContract {
  const membershipMinor = minor(input.membershipMinor, "Membership price");
  const joiningFeeMinor = minor(input.joiningFeeMinor, "Joining fee", true);
  const taxMinor = taxFromBps(membershipMinor + joiningFeeMinor, input.taxBps);
  const totalMinor = membershipMinor + joiningFeeMinor + taxMinor;
  if (!Number.isSafeInteger(totalMinor)) throw new Error("Contract total is outside the safe integer range");
  return { membershipMinor, joiningFeeMinor, taxMinor, totalMinor };
}

/**
 * Monthly run-rate used only for MRR. Daily, lifetime and session products are excluded.
 * The residual is the minor units that do not divide evenly and stay in the final recognition line.
 */
export function monthlyRunRate(
  priceMinor: number,
  interval: BillingInterval,
): { monthlyMinor: number; residualMinor: number } | null {
  minor(priceMinor, "Price");
  const divisor =
    interval === "week"
      ? null
      : interval === "month"
        ? 1
        : interval === "quarter"
          ? 3
          : interval === "half_year"
            ? 6
            : interval === "year"
              ? 12
              : null;
  if (interval === "week") {
    const annual = priceMinor * 52;
    if (!Number.isSafeInteger(annual)) throw new Error("Weekly price is outside the safe integer range");
    return { monthlyMinor: Math.floor(annual / 12), residualMinor: annual % 12 };
  }
  if (divisor === null) return null;
  return { monthlyMinor: Math.floor(priceMinor / divisor), residualMinor: priceMinor % divisor };
}

/** Remaining unrecognised value restated at a new price. The difference is the contract modification. */
export function repriceRemaining(unrecognisedMinor: number, oldPriceMinor: number, newPriceMinor: number): number {
  minor(unrecognisedMinor, "Unrecognised balance", true);
  minor(oldPriceMinor, "Old price");
  minor(newPriceMinor, "New price");
  const product = unrecognisedMinor * newPriceMinor;
  if (!Number.isSafeInteger(product)) throw new Error("Repricing is outside the safe integer range");
  return Math.floor(product / oldPriceMinor);
}
