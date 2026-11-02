import type { BillingInterval } from "@/lib/billing/pricing";

/** Annual charge divided by 12, rounded down to a minor unit. ARR is MRR × 12, not cash × 12. */
export function normalisedMrrMinor(amountMinor: number, interval: BillingInterval): number {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    throw new Error("Recurring amount must be a non-negative integer of minor units.");
  }
  return interval === "year" ? Math.floor(amountMinor / 12) : amountMinor;
}

export function arrFromMrrMinor(mrrMinor: number): number {
  if (!Number.isInteger(mrrMinor) || mrrMinor < 0) {
    throw new Error("MRR must be a non-negative integer of minor units.");
  }
  return mrrMinor * 12;
}

export type MrrMovement = {
  newMinor: number;
  expansionMinor: number;
  contractionMinor: number;
  churnedMinor: number;
  netNewMinor: number;
};

export function mrrMovement(previousMinor: number, currentMinor: number): MrrMovement {
  const previous = normalisedMrrMinor(previousMinor, "month");
  const current = normalisedMrrMinor(currentMinor, "month");
  if (previous === 0 && current > 0) {
    return {
      newMinor: current,
      expansionMinor: 0,
      contractionMinor: 0,
      churnedMinor: 0,
      netNewMinor: current,
    };
  }
  if (previous > 0 && current === 0) {
    return {
      newMinor: 0,
      expansionMinor: 0,
      contractionMinor: 0,
      churnedMinor: previous,
      netNewMinor: -previous,
    };
  }
  const delta = current - previous;
  return {
    newMinor: 0,
    expansionMinor: delta > 0 ? delta : 0,
    contractionMinor: delta < 0 ? -delta : 0,
    churnedMinor: 0,
    netNewMinor: delta,
  };
}

export type RevenueCardState = "ok" | "empty" | "forbidden" | "unseparated";

export function revenueCardState(input: {
  revenueState?: string | null | undefined;
  rows: readonly unknown[];
}): RevenueCardState {
  if (
    input.revenueState === "ok" ||
    input.revenueState === "empty" ||
    input.revenueState === "forbidden"
  ) {
    return input.revenueState;
  }
  return "unseparated";
}
