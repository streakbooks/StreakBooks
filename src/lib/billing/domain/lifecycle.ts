/**
 * Subscription lifecycle rules. The database (billing.cancellation_eligibility and the lifecycle
 * sweep) is the authority; this mirror lets the UI explain the outcome before the customer confirms.
 */
export type SubscriptionStatus =
  "trialing" | "active" | "past_due" | "paused" | "cancelled" | "expired" | "complimentary";

export type LifecycleSubscription = {
  status: SubscriptionStatus | string;
  provider: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export type CancellationEligibility =
  { allowed: true; effectiveAt: string } | { allowed: false; reason: string };

export const CANCELLATION_REASONS = [
  { id: "too_expensive", label: "Too expensive" },
  { id: "missing_features", label: "Missing features I need" },
  { id: "switching_provider", label: "Switching to another product" },
  { id: "not_using", label: "Not using it enough" },
  { id: "business_closed", label: "Business closed or paused" },
  { id: "other", label: "Something else" },
] as const;
export type CancellationReason = (typeof CANCELLATION_REASONS)[number]["id"];

function later(now: Date, value: string | null): string {
  if (!value) return now.toISOString();
  const time = Date.parse(value);
  return Number.isNaN(time) || time < now.getTime()
    ? now.toISOString()
    : new Date(time).toISOString();
}

export function cancellationEligibility(
  sub: LifecycleSubscription | null,
  now: Date,
): CancellationEligibility {
  if (!sub) return { allowed: false, reason: "This organisation has no subscription." };
  if (sub.status === "complimentary") {
    return { allowed: false, reason: "Demo and complimentary organisations are not billed." };
  }
  if (sub.status === "cancelled" || sub.status === "expired") {
    return { allowed: false, reason: "The subscription has already ended." };
  }
  if (sub.cancelAtPeriodEnd)
    return { allowed: false, reason: "Cancellation is already scheduled." };
  if (sub.status === "paused") {
    return { allowed: false, reason: "A paused subscription is managed by LinkBooks support." };
  }
  if (sub.provider === "stripe" || sub.provider === "razorpay") {
    return {
      allowed: false,
      reason:
        "Cancel a card or mandate subscription from Manage billing so the payment provider stops charging.",
    };
  }
  if (sub.status === "trialing") return { allowed: true, effectiveAt: later(now, sub.trialEndsAt) };
  if (sub.status === "active")
    return { allowed: true, effectiveAt: later(now, sub.currentPeriodEnd) };
  if (sub.status === "past_due") return { allowed: true, effectiveAt: now.toISOString() };
  return { allowed: false, reason: "This subscription cannot be cancelled here." };
}

const EVENT_LABELS: Record<string, string> = {
  created: "Subscription created",
  trial_started: "Free trial started",
  trial_expired: "Free trial ended",
  status_changed: "Status changed",
  plan_changed: "Plan changed",
  updated: "Subscription updated",
  cancellation_scheduled: "Cancellation scheduled",
  cancellation_reversed: "Cancellation withdrawn",
  cancelled: "Subscription ended",
  paused: "Paused by LinkBooks",
  resumed: "Resumed by LinkBooks",
  downgrade_applied: "Plan change applied",
  past_due_alert: "Payment overdue",
};

export function lifecycleEventLabel(type: string): string {
  return EVENT_LABELS[type] ?? type.replace(/_/g, " ");
}
