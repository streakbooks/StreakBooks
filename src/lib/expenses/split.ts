/** Pure helpers for splitting one expense amount across allocation legs. */

export type ExpenseSplitMethod = "amount" | "percentage" | "equal";

export type ExpenseSplitLegInput = {
  /** Required for amount splits (minor units). Ignored for equal. */
  amountMinor?: number;
  /** Required for percentage splits (0–100). Ignored for equal. */
  percentage?: number;
  label?: string;
};

export type ExpenseSplitLeg = {
  index: number;
  amountMinor: number;
  percentageBps: number;
  label: string;
};

export type ExpenseSplitResult =
  | { ok: true; legs: ExpenseSplitLeg[]; totalMinor: number }
  | { ok: false; error: string };

function assertWholeNonNegative(value: number, label: string): string | null {
  if (!Number.isSafeInteger(value) || value < 0) {
    return `${label} must be a whole number of minor units ≥ 0.`;
  }
  return null;
}

/**
 * Split `totalMinor` across legs. Remainder from percentage/equal rounding
 * is applied to the last leg so the sum always equals the original total.
 */
export function splitExpenseAmount(
  totalMinor: number,
  method: ExpenseSplitMethod,
  legs: readonly ExpenseSplitLegInput[],
): ExpenseSplitResult {
  const totalError = assertWholeNonNegative(totalMinor, "Total");
  if (totalError) return { ok: false, error: totalError };
  if (totalMinor === 0) return { ok: false, error: "Total must be greater than zero." };
  if (legs.length < 2) return { ok: false, error: "Add at least two allocation legs." };

  if (method === "amount") {
    const amounts: number[] = [];
    for (let i = 0; i < legs.length; i += 1) {
      const amount = legs[i]?.amountMinor;
      if (amount === undefined) {
        return { ok: false, error: `Leg ${i + 1} needs an amount.` };
      }
      const err = assertWholeNonNegative(amount, `Leg ${i + 1} amount`);
      if (err) return { ok: false, error: err };
      amounts.push(amount);
    }
    const sum = amounts.reduce((a, b) => a + b, 0);
    if (sum !== totalMinor) {
      return {
        ok: false,
        error: `Allocation amounts total ${sum} but the expense is ${totalMinor}.`,
      };
    }
    return {
      ok: true,
      totalMinor,
      legs: amounts.map((amountMinor, index) => ({
        index,
        amountMinor,
        percentageBps: totalMinor === 0 ? 0 : Math.round((amountMinor * 10000) / totalMinor),
        label: legs[index]?.label?.trim() || `Leg ${index + 1}`,
      })),
    };
  }

  if (method === "percentage") {
    const percentages: number[] = [];
    for (let i = 0; i < legs.length; i += 1) {
      const percentage = legs[i]?.percentage;
      if (percentage === undefined || !Number.isFinite(percentage) || percentage < 0) {
        return { ok: false, error: `Leg ${i + 1} needs a percentage ≥ 0.` };
      }
      percentages.push(percentage);
    }
    const pctSum = percentages.reduce((a, b) => a + b, 0);
    if (Math.abs(pctSum - 100) > 0.0001) {
      return { ok: false, error: `Percentages must total 100 (currently ${pctSum}).` };
    }
    const amounts = percentages.map((pct) => Math.floor((totalMinor * pct) / 100));
    const allocated = amounts.reduce((a, b) => a + b, 0);
    amounts[amounts.length - 1] = (amounts[amounts.length - 1] ?? 0) + (totalMinor - allocated);
    return {
      ok: true,
      totalMinor,
      legs: amounts.map((amountMinor, index) => ({
        index,
        amountMinor,
        percentageBps: Math.round((percentages[index] ?? 0) * 100),
        label: legs[index]?.label?.trim() || `Leg ${index + 1}`,
      })),
    };
  }

  // equal
  const base = Math.floor(totalMinor / legs.length);
  const amounts = legs.map(() => base);
  const allocated = base * legs.length;
  amounts[amounts.length - 1] = (amounts[amounts.length - 1] ?? 0) + (totalMinor - allocated);
  return {
    ok: true,
    totalMinor,
    legs: amounts.map((amountMinor, index) => ({
      index,
      amountMinor,
      percentageBps: totalMinor === 0 ? 0 : Math.round((amountMinor * 10000) / totalMinor),
      label: legs[index]?.label?.trim() || `Leg ${index + 1}`,
    })),
  };
}

/** Allocate tax proportionally to split net amounts; remainder on the last leg. */
export function allocateTaxAcrossLegs(
  taxMinor: number,
  netAmounts: readonly number[],
): number[] | { error: string } {
  const taxError = assertWholeNonNegative(taxMinor, "Tax");
  if (taxError) return { error: taxError };
  if (netAmounts.length === 0) return { error: "No net amounts to allocate tax against." };
  for (let i = 0; i < netAmounts.length; i += 1) {
    const err = assertWholeNonNegative(netAmounts[i] ?? 0, `Net amount ${i + 1}`);
    if (err) return { error: err };
  }
  const netTotal = netAmounts.reduce((a, b) => a + b, 0);
  if (netTotal === 0) {
    const zeros = netAmounts.map(() => 0);
    zeros[zeros.length - 1] = taxMinor;
    return zeros;
  }
  const taxes = netAmounts.map((net) => Math.floor((taxMinor * net) / netTotal));
  const allocated = taxes.reduce((a, b) => a + b, 0);
  taxes[taxes.length - 1] = (taxes[taxes.length - 1] ?? 0) + (taxMinor - allocated);
  return taxes;
}
