import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRIAL_REMINDER_SCHEDULE,
  formatTrialExpiryCopy,
  remainingTrialDays,
  reminderDueAt,
  resolveTrialPolicyLocal,
  trialReminderIdempotencyKey,
} from "@/lib/billing/trial-lifecycle";
import { trialEndUnixForPaidCheckout } from "@/lib/billing/checkout-payload";

const GLOBAL = {
  enabled: true,
  defaultDays: 30,
  requirePaymentMethod: false,
  firstTimeOnly: true,
  allowReuse: false,
  allowManualGrant: true,
  readOnlyAfterExpiry: true,
  version: 1,
};

describe("trial policy resolution", () => {
  it("defaults to a 30-day no-card trial", () => {
    const resolved = resolveTrialPolicyLocal({
      global: GLOBAL,
      plan: { trialEnabled: true, trialDays: 30, isActive: true },
    });
    expect(resolved.enabled).toBe(true);
    expect(resolved.days).toBe(30);
    expect(resolved.requirePaymentMethod).toBe(false);
  });

  it("uses plan-level duration when the plan enables trials", () => {
    expect(
      resolveTrialPolicyLocal({
        global: GLOBAL,
        plan: { trialEnabled: true, trialDays: 14, isActive: true },
      }).days,
    ).toBe(14);
  });

  it("disables trials when global policy is off", () => {
    expect(
      resolveTrialPolicyLocal({
        global: { ...GLOBAL, enabled: false },
        plan: { trialEnabled: true, trialDays: 30, isActive: true },
      }).enabled,
    ).toBe(false);
  });

  it("applies country overrides before plan days when country sets days", () => {
    const resolved = resolveTrialPolicyLocal({
      global: GLOBAL,
      country: { enabled: true, trialDays: 60, requirePaymentMethod: null },
      plan: { trialEnabled: true, trialDays: 30, isActive: true },
    });
    // Plan still wins for days when trial_enabled on plan (matches SQL plan branch).
    expect(resolved.days).toBe(30);
    expect(resolved.enabled).toBe(true);
  });

  it("honours payment-method-required from country when plan has no override of that flag", () => {
    expect(
      resolveTrialPolicyLocal({
        global: GLOBAL,
        country: { enabled: true, trialDays: null, requirePaymentMethod: true },
        plan: { trialEnabled: true, trialDays: 30, isActive: true },
      }).requirePaymentMethod,
    ).toBe(true);
  });
});

describe("trial reminders", () => {
  const start = new Date("2026-11-01T00:00:00.000Z");
  const end = new Date("2026-12-01T00:00:00.000Z");

  it("schedules welcome, 7/3/1 day and expiry reminders", () => {
    expect(DEFAULT_TRIAL_REMINDER_SCHEDULE.map((row) => row.kind)).toEqual([
      "welcome",
      "d7",
      "d3",
      "d1",
      "expired",
    ]);
    expect(
      reminderDueAt({
        kind: "welcome",
        trialStartedAt: start,
        trialEndsAt: end,
        daysBeforeExpiry: null,
      }),
    ).toEqual(start);
    expect(
      reminderDueAt({
        kind: "d7",
        trialStartedAt: start,
        trialEndsAt: end,
        daysBeforeExpiry: 7,
      }).toISOString(),
    ).toBe("2026-11-24T00:00:00.000Z");
    expect(
      reminderDueAt({
        kind: "d3",
        trialStartedAt: start,
        trialEndsAt: end,
        daysBeforeExpiry: 3,
      }).toISOString(),
    ).toBe("2026-11-28T00:00:00.000Z");
    expect(
      reminderDueAt({
        kind: "d1",
        trialStartedAt: start,
        trialEndsAt: end,
        daysBeforeExpiry: 1,
      }).toISOString(),
    ).toBe("2026-11-30T00:00:00.000Z");
    expect(
      reminderDueAt({
        kind: "expired",
        trialStartedAt: start,
        trialEndsAt: end,
        daysBeforeExpiry: 0,
      }),
    ).toEqual(end);
  });

  it("uses a stable idempotency key per company/kind/expiry", () => {
    const a = trialReminderIdempotencyKey("co", "d7", end);
    const b = trialReminderIdempotencyKey("co", "d7", end);
    expect(a).toBe(b);
    expect(a).toContain("d7");
  });

  it("formats expiry copy with timezone", () => {
    const copy = formatTrialExpiryCopy({
      companyName: "Acme",
      planCode: "pro",
      remainingDays: 3,
      endsAt: end,
      timeZone: "Asia/Kolkata",
    });
    expect(copy.subject).toContain("3");
    expect(copy.body).toContain("Acme");
    expect(copy.body).toContain("Asia/Kolkata");
  });

  it("computes remaining days", () => {
    expect(
      remainingTrialDays("2026-12-01T00:00:00.000Z", new Date("2026-11-28T00:00:00.000Z")),
    ).toBe(3);
  });
});

describe("paid conversion vs trial carry", () => {
  it("does not forward no-card trial into provider checkout", () => {
    expect(
      trialEndUnixForPaidCheckout({
        trialEndsAt: "2026-12-15T00:00:00.000Z",
        existingProvider: "none",
        now: new Date("2026-11-28T00:00:00.000Z"),
      }),
    ).toBeNull();
  });
});
