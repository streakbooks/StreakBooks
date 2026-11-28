/** Persisted UPI / e-mandate plan-migration statuses (must match SQL CHECK). */

export const UPI_MIGRATION_STATUSES = [
  "initiated",
  "new_subscription_created",
  "awaiting_customer_authorization",
  "awaiting_payment",
  "new_subscription_confirmed",
  "old_subscription_cancellation_pending",
  "old_subscription_cancellation_failed",
  "entitlement_update_pending",
  "completed",
  "failed",
  "requires_manual_review",
] as const;

export type UpiMigrationStatus = (typeof UPI_MIGRATION_STATUSES)[number];

export const UPI_MIGRATION_TERMINAL: ReadonlySet<UpiMigrationStatus> = new Set([
  "completed",
  "failed",
]);

/** Allowed from → to transitions (enforced in app; SQL also checks from-status list). */
export const UPI_MIGRATION_TRANSITIONS: Record<UpiMigrationStatus, readonly UpiMigrationStatus[]> =
  {
    initiated: ["new_subscription_created", "failed"],
    new_subscription_created: ["awaiting_customer_authorization", "failed"],
    awaiting_customer_authorization: ["awaiting_payment", "new_subscription_confirmed", "failed"],
    awaiting_payment: ["new_subscription_confirmed", "failed"],
    new_subscription_confirmed: [
      "old_subscription_cancellation_pending",
      "entitlement_update_pending",
      "requires_manual_review",
    ],
    entitlement_update_pending: [
      "old_subscription_cancellation_pending",
      "requires_manual_review",
      "failed",
    ],
    old_subscription_cancellation_pending: [
      "completed",
      "old_subscription_cancellation_failed",
      "requires_manual_review",
    ],
    old_subscription_cancellation_failed: [
      "old_subscription_cancellation_pending",
      "completed",
      "requires_manual_review",
    ],
    completed: [],
    failed: [],
    requires_manual_review: ["old_subscription_cancellation_pending", "completed", "failed"],
  };

export function canTransitionUpiMigration(
  from: UpiMigrationStatus,
  to: UpiMigrationStatus,
): boolean {
  return UPI_MIGRATION_TRANSITIONS[from]?.includes(to) ?? false;
}

export function upfrontMigrationEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = (env["RAZORPAY_UPI_MIGRATION_UPFRONT"] ?? "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
}

export function upiMigrationFeatureEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = (env["RAZORPAY_UPI_MIGRATION_ENABLED"] ?? "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
}
