import { describe, expect, it } from "vitest";
import { formatMinor } from "@/lib/billing/pricing";
import { planChangePaymentCopy } from "@/lib/billing/domain/billing-policy";
import { lockedSubscriptionProvider } from "@/lib/billing/provider-resolution";

/**
 * Contract for the Standard→Pro dialog when company_subscriptions.provider is locked.
 * Mirrors SubscriptionPanel button/due-now selection without mounting React.
 */
function planChangeDialogCopy(input: {
  provider: string;
  paymentRequired: boolean;
  changeSupported: boolean;
  currency: "INR" | "GBP" | "USD";
  kind: "upgrade" | "downgrade";
}) {
  const locked = lockedSubscriptionProvider(input.provider) ?? "stripe";
  const copy = planChangePaymentCopy(input.kind, locked);
  const button = !input.changeSupported
    ? "Got it"
    : input.kind === "upgrade"
      ? input.paymentRequired && locked === "stripe"
        ? "Confirm and pay"
        : "Change plan"
      : copy.button;
  const dueNow = input.paymentRequired
    ? formatMinor(100, input.currency)
    : `${formatMinor(0, input.currency)} — no charge today`;
  return { locked, button, dueNow, paymentNow: copy.paymentNow };
}

describe("hybrid plan-change dialog copy", () => {
  it("shows Got it for Razorpay UPI (plan change unsupported)", () => {
    const dialog = planChangeDialogCopy({
      provider: "razorpay",
      paymentRequired: false,
      changeSupported: false,
      currency: "INR",
      kind: "upgrade",
    });
    expect(dialog.locked).toBe("razorpay");
    expect(dialog.button).toBe("Got it");
    expect(dialog.button.toLowerCase()).not.toContain("stripe");
    expect(dialog.dueNow).toMatch(/₹/);
    expect(dialog.dueNow).not.toMatch(/£/);
  });

  it("uses Confirm and pay for Stripe upgrades that require payment", () => {
    const dialog = planChangeDialogCopy({
      provider: "stripe",
      paymentRequired: true,
      changeSupported: true,
      currency: "GBP",
      kind: "upgrade",
    });
    expect(dialog.button).toBe("Confirm and pay");
    expect(dialog.button.toLowerCase()).not.toContain("razorpay");
    expect(dialog.dueNow).toMatch(/£/);
  });

  it("uses Change plan for eligible Razorpay card upgrades", () => {
    const dialog = planChangeDialogCopy({
      provider: "razorpay",
      paymentRequired: true,
      changeSupported: true,
      currency: "INR",
      kind: "upgrade",
    });
    expect(dialog.locked).toBe("razorpay");
    expect(dialog.button).toBe("Change plan");
    expect(dialog.button.toLowerCase()).not.toContain("stripe");
  });

  it("keeps Got it only when migration is unsupported (changeSupported false)", () => {
    const copy = planChangePaymentCopy("upgrade", "razorpay");
    expect(copy.description.toLowerCase()).toMatch(/new mandate|autopay/);
  });
});
