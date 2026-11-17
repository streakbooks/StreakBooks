/**
 * Map dated AR/AP as-at report results into period-close control-tie facts.
 * Original LinkBooks adapter — keeps close checklist independent of report row shapes.
 */

export type AsAtControlTieInput = {
  /** null when foreign-currency documents prevent a single base-currency variance. */
  varianceMinor: number | null;
  tiesToControl: boolean | null;
};

export type CloseSubledgerTie = {
  found: boolean;
  variance: number;
  /** Extra detail for the checklist UI when multi-currency blocks an automatic pass. */
  multiCurrencyBlocked: boolean;
};

/**
 * Successful as-at load implies the control account was resolved (otherwise the report throws).
 * Mixed-currency companies cannot auto-pass the tie: treat as a blocking variance.
 */
export function closeTieFromAsAt(input: AsAtControlTieInput): CloseSubledgerTie {
  if (input.varianceMinor === null || input.tiesToControl === null) {
    return { found: true, variance: 1, multiCurrencyBlocked: true };
  }
  return {
    found: true,
    variance: input.varianceMinor,
    multiCurrencyBlocked: false,
  };
}
