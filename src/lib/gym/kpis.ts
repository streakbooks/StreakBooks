import { monthlyRunRate, type BillingInterval } from "@/lib/gym/pricing";

export type RecurringMembership = {
  priceMinor: number;
  interval: BillingInterval;
  status: "active" | "frozen" | "other";
};

/**
 * Retention of the opening cohort. New members in the period are removed from the closing count.
 * Returns null when the opening cohort is empty so the dashboard does not invent a rate.
 */
export function retentionRate(openingActive: number, closingActive: number, newInPeriod: number): number | null {
  for (const [label, value] of [
    ["Opening", openingActive],
    ["Closing", closingActive],
    ["New", newInPeriod],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} count is invalid`);
  }
  if (openingActive === 0) return null;
  const retained = closingActive - newInPeriod;
  return retained / openingActive;
}

export function churnRate(openingActive: number, closingActive: number, newInPeriod: number): number | null {
  const retention = retentionRate(openingActive, closingActive, newInPeriod);
  return retention === null ? null : 1 - retention;
}

export function recurringRevenue(memberships: readonly RecurringMembership[]): {
  mrrMinor: number;
  arrMinor: number;
  residualMinor: number;
  excludedCount: number;
} {
  let mrrMinor = 0;
  let residualMinor = 0;
  let excludedCount = 0;
  for (const membership of memberships) {
    if (membership.status !== "active") continue;
    const rate = monthlyRunRate(membership.priceMinor, membership.interval);
    if (!rate) {
      excludedCount += 1;
      continue;
    }
    mrrMinor += rate.monthlyMinor;
    residualMinor += rate.residualMinor;
  }
  return { mrrMinor, arrMinor: mrrMinor * 12, residualMinor, excludedCount };
}
