import { describe, expect, it } from "vitest";
import {
  classifyRetiredMigrationSubscriptionEvent,
  migrationTreatsOldSubscriptionAsRetired,
} from "@/lib/billing/upi-migration.server";
import { canTransitionUpiMigration } from "@/lib/billing/upi-migration-states";

describe("retired UPI migration subscription events", () => {
  it("marks old subscription ended without treating it as unknown", () => {
    expect(classifyRetiredMigrationSubscriptionEvent({ kind: "subscription_ended" }).action).toBe(
      "mark_old_cancelled",
    );
  });

  it("alerts on delayed charged / active state instead of applying entitlements", () => {
    expect(
      classifyRetiredMigrationSubscriptionEvent({
        kind: "subscription_state",
        eventType: "subscription.charged",
        status: "active",
      }).action,
    ).toBe("alert_unexpected_charge");
    expect(
      classifyRetiredMigrationSubscriptionEvent({
        kind: "subscription_state",
        eventType: "subscription.updated",
        status: "active",
      }).action,
    ).toBe("alert_unexpected_charge");
  });

  it("alerts payment failures on the retired mandate", () => {
    expect(classifyRetiredMigrationSubscriptionEvent({ kind: "payment_failed" }).action).toBe(
      "alert_payment_failed",
    );
  });

  it("ignores non-mutating retired updates", () => {
    expect(
      classifyRetiredMigrationSubscriptionEvent({
        kind: "subscription_state",
        eventType: "subscription.pending",
        status: null,
      }).action,
    ).toBe("ignore_non_mutating");
  });

  it("never routes checkout_completed for a retired id into a silent unknown skip", () => {
    expect(classifyRetiredMigrationSubscriptionEvent({ kind: "checkout_completed" }).action).toBe(
      "alert_other",
    );
  });

  it("treats duplicate charged events the same as the first (idempotent classify)", () => {
    const first = classifyRetiredMigrationSubscriptionEvent({
      kind: "subscription_state",
      eventType: "subscription.charged",
      status: "active",
    });
    const second = classifyRetiredMigrationSubscriptionEvent({
      kind: "subscription_state",
      eventType: "subscription.charged",
      status: "active",
    });
    expect(first).toEqual(second);
    expect(first.action).toBe("alert_unexpected_charge");
  });
});

describe("when old subscription is considered retired", () => {
  const base = {
    oldProviderSubscriptionId: "sub_old",
    newProviderSubscriptionId: "sub_new" as string | null,
    confirmedAt: null as string | null,
  };

  it("keeps old mandate live during awaiting authorisation (renewal must still apply)", () => {
    expect(
      migrationTreatsOldSubscriptionAsRetired(
        { ...base, status: "awaiting_customer_authorization" },
        "sub_old",
      ),
    ).toBe(false);
  });

  it("retires old mandate after new subscription is confirmed", () => {
    expect(
      migrationTreatsOldSubscriptionAsRetired(
        { ...base, status: "new_subscription_confirmed", confirmedAt: "2026-11-28T00:00:00Z" },
        "sub_new",
      ),
    ).toBe(true);
  });

  it("retires old mandate when company row already points at the new id (restart lag)", () => {
    expect(
      migrationTreatsOldSubscriptionAsRetired({ ...base, status: "awaiting_payment" }, "sub_new"),
    ).toBe(true);
  });

  it("retires during cancellation timeout / retry states", () => {
    expect(
      migrationTreatsOldSubscriptionAsRetired(
        { ...base, status: "old_subscription_cancellation_pending" },
        "sub_new",
      ),
    ).toBe(true);
    expect(
      migrationTreatsOldSubscriptionAsRetired(
        { ...base, status: "old_subscription_cancellation_failed" },
        "sub_new",
      ),
    ).toBe(true);
  });

  it("retires after completed migration so delayed old events never overwrite entitlements", () => {
    expect(
      migrationTreatsOldSubscriptionAsRetired({ ...base, status: "completed" }, "sub_new"),
    ).toBe(true);
  });
});

describe("migration restart / cancel failure state machine", () => {
  it("allows confirm → cancel pending → failed → pending retry → completed", () => {
    expect(
      canTransitionUpiMigration(
        "new_subscription_confirmed",
        "old_subscription_cancellation_pending",
      ),
    ).toBe(true);
    expect(
      canTransitionUpiMigration(
        "old_subscription_cancellation_pending",
        "old_subscription_cancellation_failed",
      ),
    ).toBe(true);
    expect(
      canTransitionUpiMigration(
        "old_subscription_cancellation_failed",
        "old_subscription_cancellation_pending",
      ),
    ).toBe(true);
    expect(canTransitionUpiMigration("old_subscription_cancellation_pending", "completed")).toBe(
      true,
    );
  });

  it("allows new confirmed + old cancel failure to escalate to manual review", () => {
    expect(canTransitionUpiMigration("new_subscription_confirmed", "requires_manual_review")).toBe(
      true,
    );
    expect(
      canTransitionUpiMigration("old_subscription_cancellation_failed", "requires_manual_review"),
    ).toBe(true);
    expect(
      canTransitionUpiMigration("requires_manual_review", "old_subscription_cancellation_pending"),
    ).toBe(true);
  });

  it("allows awaiting states to recover into confirmed after restart", () => {
    expect(
      canTransitionUpiMigration("awaiting_customer_authorization", "new_subscription_confirmed"),
    ).toBe(true);
    expect(canTransitionUpiMigration("awaiting_payment", "new_subscription_confirmed")).toBe(true);
  });
});
