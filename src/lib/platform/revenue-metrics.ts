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

export type RecognisedSubscription = {
  companyId: string;
  currency: string;
  mrrMinor: number;
};

export type StoredMrrPosition = {
  companyId: string;
  currency: string;
  currentMinor: number;
};

export type MrrReconciliationRow = {
  currency: string;
  overviewMinor: number;
  storedMinor: number;
  /** Overview minus stored. Positive means the live book is higher than history. */
  differenceMinor: number;
};

export type MrrReconciliation = {
  /** Empty means neither side has recognised MRR. It is not a zero balance. */
  state: "empty" | "match" | "mismatch" | "uncovered";
  rows: MrrReconciliationRow[];
  missingFromStore: string[];
  extraInStore: string[];
  drift: string[];
};

function assertCompanyId(companyId: string) {
  if (companyId.trim() === "" || companyId !== companyId.trim()) {
    throw new Error("A business id is required.");
  }
}

function assertCurrency(currency: string) {
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be a three-letter code.");
}

function assertMinor(amount: number, label: string) {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`${label} must be a non-negative integer of minor units.`);
  }
}

function addMinor(totals: Map<string, number>, currency: string, amount: number) {
  totals.set(currency, (totals.get(currency) ?? 0) + amount);
}

/**
 * Compare the latest stored position of each business with the overview's active MRR.
 * A churned stored row (current zero) is not open MRR. A missing history is uncovered, not zero.
 */
export function reconcileMrr(input: {
  overview: readonly RecognisedSubscription[];
  stored: readonly StoredMrrPosition[];
}): MrrReconciliation {
  const overview = new Map<string, RecognisedSubscription>();
  for (const row of input.overview) {
    assertCompanyId(row.companyId);
    assertCurrency(row.currency);
    assertMinor(row.mrrMinor, "Overview MRR");
    if (overview.has(row.companyId)) throw new Error("A business has more than one active price.");
    overview.set(row.companyId, row);
  }
  const stored = new Map<string, StoredMrrPosition>();
  for (const row of input.stored) {
    assertCompanyId(row.companyId);
    assertCurrency(row.currency);
    assertMinor(row.currentMinor, "Stored MRR");
    if (stored.has(row.companyId)) throw new Error("A business has more than one stored position.");
    stored.set(row.companyId, row);
  }
  const missingFromStore: string[] = [];
  const drift: string[] = [];
  for (const [companyId, live] of overview) {
    const position = stored.get(companyId);
    if (!position) missingFromStore.push(companyId);
    else if (position.currency !== live.currency || position.currentMinor !== live.mrrMinor)
      drift.push(companyId);
  }
  const extraInStore: string[] = [];
  for (const [companyId, position] of stored) {
    if (position.currentMinor > 0 && !overview.has(companyId)) extraInStore.push(companyId);
  }
  const overviewTotals = new Map<string, number>();
  const storedTotals = new Map<string, number>();
  for (const row of overview.values()) addMinor(overviewTotals, row.currency, row.mrrMinor);
  for (const row of stored.values()) {
    if (row.currentMinor > 0) addMinor(storedTotals, row.currency, row.currentMinor);
  }
  const currencies = [...new Set([...overviewTotals.keys(), ...storedTotals.keys()])].sort();
  const rows = currencies.map((currency) => {
    const overviewMinor = overviewTotals.get(currency) ?? 0;
    const storedMinor = storedTotals.get(currency) ?? 0;
    return { currency, overviewMinor, storedMinor, differenceMinor: overviewMinor - storedMinor };
  });
  const openStored = [...stored.values()].filter((row) => row.currentMinor > 0).length;
  const state: MrrReconciliation["state"] =
    overview.size === 0 && openStored === 0
      ? "empty"
      : missingFromStore.length > 0 &&
          openStored === 0 &&
          extraInStore.length === 0 &&
          drift.length === 0
        ? "uncovered"
        : missingFromStore.length === 0 && extraInStore.length === 0 && drift.length === 0
          ? "match"
          : "mismatch";
  return {
    state,
    rows,
    missingFromStore: missingFromStore.sort(),
    extraInStore: extraInStore.sort(),
    drift: drift.sort(),
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
