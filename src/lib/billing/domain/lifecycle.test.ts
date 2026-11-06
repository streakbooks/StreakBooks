import { describe, expect, it } from "vitest";
import {
  cancellationEligibility,
  lifecycleEventLabel,
  type LifecycleSubscription,
} from "./lifecycle";

const now = new Date("2026-11-05T12:00:00Z");
const base: LifecycleSubscription = {
  status: "trialing",
  provider: "none",
  trialEndsAt: "2026-12-05T12:00:00.000Z",
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

describe("cancellationEligibility", () => {
  it("schedules a trial cancellation for the trial end", () => {
    expect(cancellationEligibility(base, now)).toEqual({
      allowed: true,
      effectiveAt: "2026-12-05T12:00:00.000Z",
    });
  });

  it("ends an already-finished period immediately", () => {
    expect(cancellationEligibility({ ...base, trialEndsAt: "2026-11-01T00:00:00Z" }, now)).toEqual({
      allowed: true,
      effectiveAt: now.toISOString(),
    });
    expect(
      cancellationEligibility({ ...base, status: "past_due", currentPeriodEnd: null }, now),
    ).toEqual({ allowed: true, effectiveAt: now.toISOString() });
  });

  it("keeps an active subscription until its period end", () => {
    expect(
      cancellationEligibility(
        { ...base, status: "active", currentPeriodEnd: "2026-11-30T00:00:00.000Z" },
        now,
      ),
    ).toEqual({ allowed: true, effectiveAt: "2026-11-30T00:00:00.000Z" });
  });

  it.each([
    [{ status: "complimentary" }, "Demo and complimentary"],
    [{ status: "expired" }, "already ended"],
    [{ cancelAtPeriodEnd: true }, "already scheduled"],
    [{ status: "paused" }, "LinkBooks support"],
    [{ provider: "stripe", status: "active" }, "Manage billing"],
    [{ provider: "razorpay" }, "Manage billing"],
  ] as const)("refuses %o", (patch, reason) => {
    const result = cancellationEligibility({ ...base, ...patch }, now);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain(reason);
  });

  it("refuses when there is no subscription", () => {
    expect(cancellationEligibility(null, now).allowed).toBe(false);
  });

  it("labels history events", () => {
    expect(lifecycleEventLabel("cancellation_scheduled")).toBe("Cancellation scheduled");
    expect(lifecycleEventLabel("something_new")).toBe("something new");
  });
});
