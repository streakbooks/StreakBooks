/** Management arithmetic on entered cash flows. This is not a statutory valuation. */
export function netPresentValue(annualRateBps: number, cashflows: readonly number[]): number {
  if (!Number.isInteger(annualRateBps) || annualRateBps < 0 || annualRateBps > 100000) {
    throw new Error("Discount rate must be between 0 and 1000%.");
  }
  const rate = annualRateBps / 10000;
  const value = cashflows.reduce((sum, cash, period) => sum + cash / (1 + rate) ** period, 0);
  return Math.round(value);
}

/** Returns basis points, or null when the series has no sign change or does not converge. */
export function internalRateOfReturnBps(cashflows: readonly number[]): number | null {
  if (cashflows.length < 2) return null;
  if (!cashflows.some((cash) => cash > 0) || !cashflows.some((cash) => cash < 0)) return null;
  let rate = 0.1;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let present = 0;
    let derivative = 0;
    for (let period = 0; period < cashflows.length; period += 1) {
      const cash = cashflows[period] ?? 0;
      const denominator = (1 + rate) ** period;
      present += cash / denominator;
      if (period > 0) derivative -= (period * cash) / (1 + rate) ** (period + 1);
    }
    if (Math.abs(present) < 1e-6) return Math.round(rate * 10000);
    if (derivative === 0) return null;
    rate -= present / derivative;
    if (rate <= -0.99 || rate > 10) return null;
  }
  return null;
}

export function undiscountedReturn(inflowsMinor: number, outflowsMinor: number): number | null {
  if (outflowsMinor <= 0) return null;
  return inflowsMinor - outflowsMinor;
}
