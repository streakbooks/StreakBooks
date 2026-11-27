import { describe, expect, it } from "vitest";
import {
  estimateProratedDifferenceMinor,
  razorpayMandateKindFromNotes,
  razorpaySupportsImmediatePlanChange,
  remainingBillingDays,
} from "@/lib/billing/plan-change-math";

describe("plan-change math", () => {
  it("counts remaining billing days from period end", () => {
    const now = new Date("2026-11-27T12:00:00.000Z");
    expect(remainingBillingDays("2026-12-12T12:00:00.000Z", now)).toBe(15);
    expect(remainingBillingDays("2026-11-27T11:00:00.000Z", now)).toBe(0);
    expect(remainingBillingDays(null, now)).toBeNull();
  });

  it("estimates prorated upgrade for the remaining fraction of the cycle", () => {
    const now = new Date("2026-11-16T00:00:00.000Z");
    const amount = estimateProratedDifferenceMinor({
      currentAmountMinor: 10000,
      targetAmountMinor: 20000,
      periodStartIso: "2026-11-01T00:00:00.000Z",
      periodEndIso: "2026-12-01T00:00:00.000Z",
      now,
    });
    // 15 of 30 days remaining → half of ₹100 difference = 5000
    expect(amount).toBe(5000);
  });

  it("maps Razorpay mandate kinds and only allows card for immediate updates", () => {
    expect(razorpayMandateKindFromNotes({ pay_method: "upi" }, null)).toBe("upi");
    expect(razorpayMandateKindFromNotes({ pay_method: "card" }, null)).toBe("card");
    expect(razorpayMandateKindFromNotes({}, "emandate")).toBe("emandate");
    expect(razorpaySupportsImmediatePlanChange("card")).toBe(true);
    expect(razorpaySupportsImmediatePlanChange("upi")).toBe(false);
    expect(razorpaySupportsImmediatePlanChange("emandate")).toBe(false);
    expect(razorpaySupportsImmediatePlanChange("unknown")).toBe(false);
  });
});
