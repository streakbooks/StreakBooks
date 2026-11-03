const STATUSES = [
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "expired",
  "complimentary",
  "paused",
] as const;

export type SubscriptionStatusCount = (typeof STATUSES)[number] | "other";

export type SubscriptionCohortMonth = {
  month: string;
  trialing: number;
  active: number;
  past_due: number;
  cancelled: number;
  expired: number;
  complimentary: number;
  paused: number;
  other: number;
  total: number;
};

export type SubscriptionStartCohorts = {
  unknownStart: number;
  months: SubscriptionCohortMonth[];
};

function emptyMonth(month: string): SubscriptionCohortMonth {
  return {
    month,
    trialing: 0,
    active: 0,
    past_due: 0,
    cancelled: 0,
    expired: 0,
    complimentary: 0,
    paused: 0,
    other: 0,
    total: 0,
  };
}

function utcMonth(startedAt: string): string {
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) throw new Error("Subscription start must be a real timestamp.");
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Group subscriptions by the UTC month of a stored start.
 * A missing start is counted separately and is not assigned to a month.
 * This is not revenue, lifetime value, or fees.
 */
export function subscriptionStartCohorts(
  rows: readonly { startedAt: string | null; status: string }[],
): SubscriptionStartCohorts {
  const months = new Map<string, SubscriptionCohortMonth>();
  let unknownStart = 0;
  for (const row of rows) {
    if (row.startedAt == null) {
      unknownStart += 1;
      continue;
    }
    const month = utcMonth(row.startedAt);
    const bucket = months.get(month) ?? emptyMonth(month);
    const status = STATUSES.find((item) => item === row.status) ?? "other";
    bucket[status] += 1;
    bucket.total += 1;
    months.set(month, bucket);
  }
  return {
    unknownStart,
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}
