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

export type StoredMrrMovement = {
  previousMinor: number;
  currentMinor: number;
  movement: "new" | "expansion" | "contraction" | "churn" | "unchanged" | "baseline";
  deltaMinor: number;
};

/** Same classes as `mrrMovement`. Unchanged pairs are not stored. */
export function storedMrrMovement(previousMinor: number, currentMinor: number): StoredMrrMovement {
  const classified = mrrMovement(previousMinor, currentMinor);
  const movement =
    previousMinor === currentMinor
      ? "unchanged"
      : classified.newMinor > 0
        ? "new"
        : classified.churnedMinor > 0
          ? "churn"
          : classified.expansionMinor > 0
            ? "expansion"
            : "contraction";
  return {
    previousMinor,
    currentMinor,
    movement,
    deltaMinor: classified.netNewMinor,
  };
}

/** First observation of recognised MRR. It is not new, expansion, or churn. */
export function openingMrrBaseline(currentMinor: number): StoredMrrMovement {
  const current = normalisedMrrMinor(currentMinor, "month");
  if (current <= 0) throw new Error("A baseline needs recognised MRR above zero.");
  return { previousMinor: current, currentMinor: current, movement: "baseline", deltaMinor: 0 };
}

export function sumMrrMovements(rows: readonly MrrMovement[]): MrrMovement {
  const total: MrrMovement = {
    newMinor: 0,
    expansionMinor: 0,
    contractionMinor: 0,
    churnedMinor: 0,
    netNewMinor: 0,
  };
  for (const row of rows) {
    for (const key of Object.keys(total) as (keyof MrrMovement)[]) {
      if (!Number.isInteger(row[key])) throw new Error("MRR movement fields must be integers.");
      total[key] += row[key];
    }
  }
  return total;
}

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
