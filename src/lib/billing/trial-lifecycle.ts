/**
 * Pure trial lifecycle helpers (policy display + reminder schedule math).
 * Enforcement and durable jobs live in SQL (`billing.resolve_trial_policy`,
 * `billing.schedule_trial_reminders`) and `trial-lifecycle.server.ts`.
 */

export const TRIAL_REMINDER_KINDS = ["welcome", "d7", "d3", "d1", "expired"] as const;
export type TrialReminderKind = (typeof TRIAL_REMINDER_KINDS)[number];

export const DEFAULT_TRIAL_REMINDER_SCHEDULE: ReadonlyArray<{
  kind: TrialReminderKind;
  daysBeforeExpiry: number | null;
}> = [
  { kind: "welcome", daysBeforeExpiry: null },
  { kind: "d7", daysBeforeExpiry: 7 },
  { kind: "d3", daysBeforeExpiry: 3 },
  { kind: "d1", daysBeforeExpiry: 1 },
  { kind: "expired", daysBeforeExpiry: 0 },
];

export type ResolvedTrialPolicy = {
  enabled: boolean;
  days: number;
  requirePaymentMethod: boolean;
  firstTimeOnly: boolean;
  allowReuse: boolean;
  allowManualGrant: boolean;
  readOnlyAfterExpiry: boolean;
  policyVersion: number;
  source: string;
};

/** Precedence for display/tests: plan → country → global (matches SQL). */
export function resolveTrialPolicyLocal(input: {
  global: {
    enabled: boolean;
    defaultDays: number;
    requirePaymentMethod: boolean;
    firstTimeOnly: boolean;
    allowReuse: boolean;
    allowManualGrant: boolean;
    readOnlyAfterExpiry: boolean;
    version: number;
  };
  country?: {
    enabled: boolean | null;
    trialDays: number | null;
    requirePaymentMethod: boolean | null;
  } | null;
  plan?: { trialEnabled: boolean; trialDays: number; isActive: boolean } | null;
}): ResolvedTrialPolicy {
  let enabled = input.global.enabled;
  let days = input.global.defaultDays;
  let requirePaymentMethod = input.global.requirePaymentMethod;

  if (input.country) {
    if (input.country.enabled != null) enabled = input.country.enabled;
    if (input.country.trialDays != null) days = input.country.trialDays;
    if (input.country.requirePaymentMethod != null) {
      requirePaymentMethod = input.country.requirePaymentMethod;
    }
  }

  if (input.plan) {
    enabled = enabled && input.plan.trialEnabled && input.plan.isActive;
    if (input.plan.trialEnabled) days = input.plan.trialDays;
  } else if (input.plan === null) {
    /* plan omitted — keep global/country */
  }

  if (!input.global.enabled) enabled = false;

  return {
    enabled,
    days,
    requirePaymentMethod,
    firstTimeOnly: input.global.firstTimeOnly,
    allowReuse: input.global.allowReuse,
    allowManualGrant: input.global.allowManualGrant,
    readOnlyAfterExpiry: input.global.readOnlyAfterExpiry,
    policyVersion: input.global.version,
    source: "resolved",
  };
}

export function reminderDueAt(input: {
  kind: TrialReminderKind;
  trialStartedAt: Date;
  trialEndsAt: Date;
  daysBeforeExpiry: number | null;
}): Date {
  if (input.kind === "welcome") return input.trialStartedAt;
  if (input.kind === "expired") return input.trialEndsAt;
  const days = input.daysBeforeExpiry ?? 0;
  return new Date(input.trialEndsAt.getTime() - days * 86_400_000);
}

export function trialReminderIdempotencyKey(
  companyId: string,
  kind: TrialReminderKind,
  trialEndsAt: Date,
): string {
  return `${companyId}:${kind}:${trialEndsAt.toISOString().replace(/\.\d{3}Z$/, "Z")}`;
}

export function remainingTrialDays(trialEndsAt: string | Date, now = new Date()): number {
  const end = typeof trialEndsAt === "string" ? Date.parse(trialEndsAt) : trialEndsAt.getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - now.getTime()) / 86_400_000));
}

export function formatTrialExpiryCopy(input: {
  companyName: string;
  planCode: string;
  remainingDays: number;
  endsAt: Date;
  timeZone: string;
}): { subject: string; body: string } {
  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: input.timeZone || "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(input.endsAt);
  return {
    subject: `Your StreakBooks trial ends in ${input.remainingDays} day(s)`,
    body: [
      `Hi ${input.companyName},`,
      "",
      `Your ${input.planCode} trial has ${input.remainingDays} day(s) remaining.`,
      `It ends on ${when} (${input.timeZone || "UTC"}).`,
      "",
      "Choose a plan in Settings → Subscription before the trial ends to keep full access.",
      "Your accounting data is preserved if the trial expires.",
    ].join("\n"),
  };
}
