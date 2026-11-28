import { describe, expect, it } from "vitest";
import {
  canTransitionUpiMigration,
  isUpiMigrationPreConfirm,
  shouldAbandonAwaitingUpiMigration,
  upfrontMigrationEnabled,
  upiMigrationAbandonTimeoutMs,
  upiMigrationFeatureEnabled,
} from "@/lib/billing/upi-migration-states";
import {
  buildUpiMigrationPreviewAmounts,
  migrationCustomerCopy,
} from "@/lib/billing/upi-migration.server";

describe("upi migration states", () => {
  it("allows confirmed → cancel pending → completed", () => {
    expect(
      canTransitionUpiMigration(
        "new_subscription_confirmed",
        "old_subscription_cancellation_pending",
      ),
    ).toBe(true);
    expect(canTransitionUpiMigration("old_subscription_cancellation_pending", "completed")).toBe(
      true,
    );
    expect(canTransitionUpiMigration("completed", "failed")).toBe(false);
  });

  it("allows pre-confirm statuses to fail for abandon / timeout recovery", () => {
    expect(canTransitionUpiMigration("awaiting_customer_authorization", "failed")).toBe(true);
    expect(canTransitionUpiMigration("awaiting_payment", "failed")).toBe(true);
    expect(canTransitionUpiMigration("new_subscription_created", "failed")).toBe(true);
    expect(canTransitionUpiMigration("initiated", "failed")).toBe(true);
    expect(canTransitionUpiMigration("new_subscription_confirmed", "failed")).toBe(false);
  });

  it("classifies pre-confirm vs post-confirm for safe abandon", () => {
    expect(isUpiMigrationPreConfirm("awaiting_customer_authorization")).toBe(true);
    expect(isUpiMigrationPreConfirm("awaiting_payment")).toBe(true);
    expect(isUpiMigrationPreConfirm("new_subscription_confirmed")).toBe(false);
    expect(isUpiMigrationPreConfirm("requires_manual_review")).toBe(false);
  });

  it("abandons only after configurable timeout and never post-confirm", () => {
    expect(upiMigrationAbandonTimeoutMs({ RAZORPAY_UPI_MIGRATION_ABANDON_HOURS: "2" })).toBe(
      2 * 60 * 60 * 1000,
    );
    const createdAt = "2026-11-28T10:00:00.000Z";
    expect(
      shouldAbandonAwaitingUpiMigration({
        status: "awaiting_customer_authorization",
        createdAt,
        nowMs: Date.parse("2026-11-28T11:59:00.000Z"),
        abandonTimeoutMs: 2 * 60 * 60 * 1000,
      }),
    ).toBe(false);
    expect(
      shouldAbandonAwaitingUpiMigration({
        status: "awaiting_customer_authorization",
        createdAt,
        nowMs: Date.parse("2026-11-28T12:01:00.000Z"),
        abandonTimeoutMs: 2 * 60 * 60 * 1000,
      }),
    ).toBe(true);
    expect(
      shouldAbandonAwaitingUpiMigration({
        status: "new_subscription_confirmed",
        createdAt,
        nowMs: Date.parse("2026-11-29T10:00:00.000Z"),
        abandonTimeoutMs: 2 * 60 * 60 * 1000,
      }),
    ).toBe(false);
  });

  it("respects feature and upfront env flags", () => {
    expect(upiMigrationFeatureEnabled({ RAZORPAY_UPI_MIGRATION_ENABLED: "0" })).toBe(false);
    expect(upiMigrationFeatureEnabled({})).toBe(true);
    expect(upfrontMigrationEnabled({ RAZORPAY_UPI_MIGRATION_UPFRONT: "false" })).toBe(false);
    expect(upfrontMigrationEnabled({})).toBe(true);
  });

  it("exposes actionable customer copy for await / fail / success", () => {
    expect(migrationCustomerCopy("awaiting_customer_authorization")).toMatch(/Waiting for UPI/i);
    expect(migrationCustomerCopy("failed")).toMatch(/retry/i);
    expect(migrationCustomerCopy("new_subscription_confirmed")).toMatch(/Upgrade successful/i);
  });
});

describe("upi migration preview amounts", () => {
  it("labels prorated difference as estimate and can disable upfront", () => {
    const start = "2026-11-01T00:00:00.000Z";
    const end = "2026-12-01T00:00:00.000Z";
    const withUpfront = buildUpiMigrationPreviewAmounts({
      currentAmountMinor: 49900,
      targetAmountMinor: 99900,
      periodStartIso: start,
      periodEndIso: end,
      currency: "INR",
      env: { RAZORPAY_UPI_MIGRATION_UPFRONT: "1" },
    });
    expect(withUpfront.amountDueIsEstimate).toBe(true);
    expect(withUpfront.proratedEstimateMinor).toBeGreaterThan(0);
    expect(withUpfront.upfrontAddonMinor).toBe(withUpfront.proratedEstimateMinor);

    const noUpfront = buildUpiMigrationPreviewAmounts({
      currentAmountMinor: 49900,
      targetAmountMinor: 99900,
      periodStartIso: start,
      periodEndIso: end,
      currency: "INR",
      env: { RAZORPAY_UPI_MIGRATION_UPFRONT: "0" },
    });
    expect(noUpfront.upfrontAddonMinor).toBe(0);
    expect(noUpfront.proratedEstimateMinor).toBeGreaterThan(0);
  });
});
