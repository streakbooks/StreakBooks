import { describe, expect, it } from "vitest";
import {
  canTransitionUpiMigration,
  upfrontMigrationEnabled,
  upiMigrationFeatureEnabled,
} from "@/lib/billing/upi-migration-states";
import { buildUpiMigrationPreviewAmounts } from "@/lib/billing/upi-migration.server";

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

  it("respects feature and upfront env flags", () => {
    expect(upiMigrationFeatureEnabled({ RAZORPAY_UPI_MIGRATION_ENABLED: "0" })).toBe(false);
    expect(upiMigrationFeatureEnabled({})).toBe(true);
    expect(upfrontMigrationEnabled({ RAZORPAY_UPI_MIGRATION_UPFRONT: "false" })).toBe(false);
    expect(upfrontMigrationEnabled({})).toBe(true);
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
