/**
 * Industry-standard subscription billing policy (Xero / Netflix / Hotstar style).
 * UI copy and server behaviour should follow these rules — do not invent ad-hoc variants.
 *
 * | Event              | Charge now?                         | Entitlement change        |
 * |--------------------|-------------------------------------|---------------------------|
 * | First subscribe    | Yes — hosted Checkout               | After payment / trial     |
 * | Free trial         | No until trial ends                 | Immediate on trial plan   |
 * | Upgrade            | Yes — prorated remainder of period  | After payment succeeds    |
 * | Downgrade          | No                                  | At period end / renewal   |
 * | Cancel             | No                                  | At period end             |
 * | Renewal            | Yes — full plan price               | Continues                 |
 */

export type PlanChangeKind = "upgrade" | "downgrade" | "same";

export function classifyPlanChange(
  currentAmountMinor: number,
  targetAmountMinor: number,
): PlanChangeKind {
  if (targetAmountMinor > currentAmountMinor) return "upgrade";
  if (targetAmountMinor < currentAmountMinor) return "downgrade";
  return "same";
}

/** Human-readable timing for switch dialogs and toasts. */
export function planChangePaymentCopy(kind: "upgrade" | "downgrade"): {
  titleVerb: string;
  paymentNow: string;
  whenStarts: string;
  button: string;
  description: string;
} {
  if (kind === "upgrade") {
    return {
      titleVerb: "Upgrade",
      paymentNow: "Yes — prorated difference on Stripe",
      whenStarts: "After payment succeeds",
      button: "Continue to Stripe",
      description:
        "Like Xero and Netflix: you pay the prorated difference for the rest of this billing period now. Your new plan starts only after that payment succeeds. If a card is already on file, Stripe may charge it and skip the pay page when no further action is needed.",
    };
  }
  return {
    titleVerb: "Downgrade",
    paymentNow: "No charge today",
    whenStarts: "At your next renewal",
    button: "Confirm downgrade",
    description:
      "Like Netflix and JioHotstar: you keep your current plan until this period ends. The lower price starts at renewal. Nothing is charged for switching down today.",
  };
}

export const BILLING_CHARGE_RULES: { title: string; body: string }[] = [
  {
    title: "Upgrade",
    body: "Pay the prorated difference now on Stripe. New plan starts after payment (Xero / Netflix).",
  },
  {
    title: "Downgrade",
    body: "No charge today. You keep the current plan until renewal (Netflix / Hotstar). You can reverse before that date.",
  },
  {
    title: "Monthly ↔ annual",
    body: "Same rules: higher effective monthly charges prorated now; lower schedules at renewal.",
  },
  {
    title: "First subscribe / trial",
    body: "Checkout for the plan price, or a free trial period first. Trial is separate from upgrades.",
  },
];
