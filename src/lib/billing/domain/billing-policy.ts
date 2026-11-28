/**
 * Industry-standard subscription billing policy (Xero / Netflix / Hotstar style).
 * UI copy and server behaviour should follow these rules — do not invent ad-hoc variants.
 *
 * | Event              | Charge now?                         | Entitlement change        |
 * |--------------------|-------------------------------------|---------------------------|
 * | First subscribe    | Yes — hosted Checkout               | After payment / trial     |
 * | Free trial         | No until trial ends                 | Immediate on trial plan   |
 * | Upgrade (Stripe)   | Yes — prorated remainder of period  | After payment succeeds    |
 * | Upgrade (Razorpay card) | Immediate update + difference charge | After Razorpay confirms |
 * | Upgrade (Razorpay UPI/e-mandate) | Not supported in-place      | Cancel → resubscribe      |
 * | Downgrade          | No                                  | At period end / renewal   |
 * | Cancel             | No                                  | At period end             |
 * | Renewal            | Yes — full plan price               | Continues                 |
 */

export type PlanChangeKind = "upgrade" | "downgrade" | "same";
export type BillingProviderLabel = "stripe" | "razorpay";

export function classifyPlanChange(
  currentAmountMinor: number,
  targetAmountMinor: number,
): PlanChangeKind {
  if (targetAmountMinor > currentAmountMinor) return "upgrade";
  if (targetAmountMinor < currentAmountMinor) return "downgrade";
  return "same";
}

/** Human-readable timing for switch dialogs and toasts — provider-aware. */
export function planChangePaymentCopy(
  kind: "upgrade" | "downgrade",
  provider: BillingProviderLabel = "stripe",
): {
  titleVerb: string;
  paymentNow: string;
  whenStarts: string;
  button: string;
  description: string;
} {
  if (provider === "razorpay") {
    // Default copy assumes UPI/e-mandate (most common India path). Preview.changeSupported
    // overrides the confirm button when an eligible Razorpay card mandate can update now.
    return {
      titleVerb: kind === "upgrade" ? "Upgrade" : "Downgrade",
      paymentNow: "Depends on payment method",
      whenStarts: "Card: after Razorpay confirms · UPI/e-mandate: after cancel + resubscribe",
      button: "Review details",
      description:
        "Eligible Razorpay cards can upgrade immediately (Razorpay charges the difference). UPI AutoPay and bank e-mandate cannot change plan mid-mandate — cancel at period end, then subscribe to the new plan.",
    };
  }

  if (kind === "upgrade") {
    return {
      titleVerb: "Upgrade",
      paymentNow: "Yes — prorated difference on Stripe",
      whenStarts: "After payment succeeds",
      button: "Confirm upgrade",
      description:
        "Like QuickBooks and Xero: you pay the prorated difference for the rest of this billing period now. Your new plan starts only after that payment succeeds. If a card is already on file, Stripe may charge it and skip the pay page when no further action is needed.",
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

export function billingChargeRules(
  provider: BillingProviderLabel | null | undefined,
): { title: string; body: string }[] {
  if (provider === "razorpay") {
    return [
      {
        title: "Upgrade (card)",
        body: "Eligible Razorpay cards update immediately. Razorpay charges or refunds the prorated difference; entitlements follow webhook confirmation.",
      },
      {
        title: "Upgrade (UPI / e-mandate)",
        body: "Not supported mid-mandate. Cancel at period end, then subscribe to the new plan.",
      },
      {
        title: "Downgrade",
        body: "Eligible cards schedule at cycle end. UPI/e-mandate require cancel + resubscribe.",
      },
      {
        title: "Cancel",
        body: "No charge today. Access continues until renewal, then the mandate ends.",
      },
      {
        title: "First subscribe / trial",
        body: "Checkout for the plan price, or a free trial period first. Prefer card if you need mid-cycle upgrades later.",
      },
    ];
  }
  if (provider === "stripe") {
    return [
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
  }
  return BILLING_CHARGE_RULES;
}

/** Generic rules when no paid provider is locked yet (subscribe / trial). */
export const BILLING_CHARGE_RULES: { title: string; body: string }[] = [
  {
    title: "Upgrade",
    body: "Stripe charges a prorated difference now. Razorpay cards may update immediately; UPI/e-mandate require cancel + resubscribe.",
  },
  {
    title: "Downgrade",
    body: "No charge today. You keep the current plan until renewal. You can reverse before that date.",
  },
  {
    title: "Monthly ↔ annual",
    body: "Higher effective monthly charges may be due now on Stripe; Razorpay card schedules or charges by mandate rules.",
  },
  {
    title: "First subscribe / trial",
    body: "Checkout for the plan price, or a free trial period first. Trial is separate from upgrades.",
  },
];
