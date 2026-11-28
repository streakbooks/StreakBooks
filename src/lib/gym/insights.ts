/**
 * Deterministic explanations from figures the caller already calculated.
 * This is not a predictive model and it does not post transactions.
 */

export type Insight = {
  available: boolean;
  title: string;
  explanation: string;
  figure: number | null;
};

const MINIMUM_COHORT = 5;

export function churnInsight(openingActive: number, cancelled: number): Insight {
  if (!Number.isSafeInteger(openingActive) || openingActive < 0) {
    throw new Error("Opening membership count is invalid");
  }
  if (!Number.isSafeInteger(cancelled) || cancelled < 0)
    throw new Error("Cancellation count is invalid");
  if (openingActive < MINIMUM_COHORT) {
    return {
      available: false,
      title: "Churn",
      explanation: `Fewer than ${MINIMUM_COHORT} opening memberships. A churn rate would not be reliable.`,
      figure: null,
    };
  }
  return {
    available: true,
    title: "Churn",
    explanation: `${cancelled} of ${openingActive} opening memberships ended. This is a historical ratio, not a forecast.`,
    figure: cancelled / openingActive,
  };
}

export function deferredExceptionInsight(cancelledWithDeferred: number): Insight {
  if (!Number.isSafeInteger(cancelledWithDeferred) || cancelledWithDeferred < 0) {
    throw new Error("Deferred exception count is invalid");
  }
  if (cancelledWithDeferred === 0) {
    return {
      available: true,
      title: "Deferred revenue",
      explanation: "Cancelled memberships have no remaining unrecognised balance.",
      figure: 0,
    };
  }
  return {
    available: true,
    title: "Deferred revenue",
    explanation: `${cancelledWithDeferred} cancelled memberships still hold unrecognised deferred revenue. Review refund or forfeit before treating it as earned.`,
    figure: cancelledWithDeferred,
  };
}
