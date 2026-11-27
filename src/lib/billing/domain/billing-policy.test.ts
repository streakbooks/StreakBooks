import { describe, expect, it } from "vitest";
import {
  billingChargeRules,
  classifyPlanChange,
  planChangePaymentCopy,
} from "@/lib/billing/domain/billing-policy";

describe("billing policy (industry standard)", () => {
  it("classifies upgrade, downgrade and same by amount", () => {
    expect(classifyPlanChange(2900, 5900)).toBe("upgrade");
    expect(classifyPlanChange(9900, 5900)).toBe("downgrade");
    expect(classifyPlanChange(5900, 5900)).toBe("same");
  });

  it("states Stripe upgrade charges now and downgrade waits for renewal", () => {
    const upgrade = planChangePaymentCopy("upgrade", "stripe");
    const downgrade = planChangePaymentCopy("downgrade", "stripe");
    expect(upgrade.paymentNow.toLowerCase()).toContain("prorated");
    expect(upgrade.button.toLowerCase()).toContain("stripe");
    expect(upgrade.whenStarts.toLowerCase()).toContain("payment");
    expect(downgrade.paymentNow.toLowerCase()).toContain("no charge");
    expect(downgrade.whenStarts.toLowerCase()).toContain("renewal");
  });

  it("explains Razorpay UPI cannot change plan mid-mandate", () => {
    const upgrade = planChangePaymentCopy("upgrade", "razorpay");
    const downgrade = planChangePaymentCopy("downgrade", "razorpay");
    expect(upgrade.button.toLowerCase()).not.toContain("stripe");
    expect(upgrade.button.toLowerCase()).toContain("got it");
    expect(upgrade.description.toLowerCase()).toMatch(/upi|e-mandate|emandate/);
    expect(upgrade.description.toLowerCase()).toContain("cancel");
    expect(downgrade.button).toBe(upgrade.button);
    expect(billingChargeRules("razorpay").some((rule) => /stripe/i.test(rule.body))).toBe(false);
    expect(billingChargeRules("razorpay").some((rule) => /upi/i.test(rule.body))).toBe(true);
  });
});
