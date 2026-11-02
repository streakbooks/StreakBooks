/**
 * Entitlement resolution for LinkBooks.
 *
 * The database function public.winning_entitlements is the enforcement copy.
 * Ranks below must stay in the same order as
 * supabase/migrations/20261102120000_entitlement_price_book.sql.
 * Postgres cannot import this module, so the order is specified once here
 * and repeated in that migration. See docs/decisions/001-extend-existing-billing.md.
 */

export const SOURCE_RANK = {
  kill_switch: 1,
  suspension: 2,
  revoke: 3,
  grant: 4,
  addon: 5,
  trial: 6,
  plan: 7,
  default: 8,
} as const;

export const SCOPE_RANK = {
  user: 1,
  business: 2,
  firm: 3,
  plan: 4,
  global: 5,
} as const;

export type EntitlementSource = keyof typeof SOURCE_RANK;
export type EntitlementScope = keyof typeof SCOPE_RANK;

export type EntitlementAssignment = {
  featureKey: string;
  source: EntitlementSource;
  scope: EntitlementScope;
  effect: "allow" | "deny";
  startsAt?: string | null;
  expiresAt?: string | null;
  reason: string;
};

export type EntitlementDecision = {
  featureKey: string;
  allowed: boolean;
  source: EntitlementSource;
  scope: EntitlementScope;
  reason: string;
};

function activeAt(row: EntitlementAssignment, now: Date): boolean {
  if (row.startsAt && Date.parse(row.startsAt) > now.getTime()) return false;
  if (row.expiresAt && Date.parse(row.expiresAt) <= now.getTime()) return false;
  return true;
}

export function resolveEntitlement(
  featureKey: string,
  assignments: readonly EntitlementAssignment[],
  now: Date,
  fallback: EntitlementAssignment = {
    featureKey,
    source: "default",
    scope: "global",
    effect: "deny",
    reason: "No entitlement is configured.",
  },
): EntitlementDecision {
  const active = assignments.filter((row) => row.featureKey === featureKey && activeAt(row, now));
  const winner = (active.length > 0 ? active : [fallback]).slice().sort(compareAssignments)[0]!;
  return {
    featureKey,
    allowed: winner.effect === "allow",
    source: winner.source,
    scope: winner.scope,
    reason: winner.reason,
  };
}

function compareAssignments(a: EntitlementAssignment, b: EntitlementAssignment): number {
  const source = SOURCE_RANK[a.source] - SOURCE_RANK[b.source];
  if (source !== 0) return source;
  const scope = SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope];
  if (scope !== 0) return scope;
  if (a.effect === b.effect) return 0;
  return a.effect === "deny" ? -1 : 1;
}

export type FeatureDependency = {
  featureKey: string;
  requires: readonly string[];
  conflicts: readonly string[];
  optional: readonly string[];
};

export type DependencyIssue = {
  featureKey: string;
  kind: "missing" | "conflict";
  otherKey: string;
  message: string;
};

export function dependencyIssues(
  selected: readonly string[],
  dependencies: readonly FeatureDependency[],
): DependencyIssue[] {
  const chosen = new Set(selected);
  const issues: DependencyIssue[] = [];
  for (const row of dependencies) {
    if (!chosen.has(row.featureKey)) continue;
    for (const required of row.requires) {
      if (!chosen.has(required)) {
        issues.push({
          featureKey: row.featureKey,
          kind: "missing",
          otherKey: required,
          message: `${row.featureKey} requires ${required}.`,
        });
      }
    }
    for (const conflict of row.conflicts) {
      if (chosen.has(conflict)) {
        issues.push({
          featureKey: row.featureKey,
          kind: "conflict",
          otherKey: conflict,
          message: `${row.featureKey} conflicts with ${conflict}.`,
        });
      }
    }
  }
  return issues;
}

export type RolloutMode =
  | "immediate"
  | "scheduled"
  | "percentage"
  | "allowlist"
  | "internal"
  | "trial"
  | "region"
  | "killed";

export type RolloutInput = {
  mode: RolloutMode;
  percent: number;
  organisationId: string;
  featureKey: string;
  allowlist: readonly string[];
  organisationRegion: string | null;
  targetRegion: string | null;
  internal: boolean;
  trialing: boolean;
  now: Date;
  startsAt: string | null;
  endsAt: string | null;
};

/** Stable 0–99 bucket. Raising the percentage adds organisations; it does not reshuffle them. */
export function rolloutBucket(organisationId: string, featureKey: string): number {
  let hash = 0;
  const text = `${organisationId}:${featureKey}`;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash % 100;
}

export function rolloutIncludes(input: RolloutInput): { included: boolean; reason: string } {
  if (input.mode === "killed") return { included: false, reason: "Global kill switch." };
  if (input.endsAt && Date.parse(input.endsAt) <= input.now.getTime()) {
    return { included: false, reason: "Rollout has ended." };
  }
  if (input.mode === "scheduled") {
    if (input.startsAt && Date.parse(input.startsAt) > input.now.getTime()) {
      return { included: false, reason: "Rollout has not started." };
    }
    return { included: true, reason: "Scheduled window is open." };
  }
  if (input.mode === "percentage") {
    const bucket = rolloutBucket(input.organisationId, input.featureKey);
    const percent = Math.min(100, Math.max(0, Math.trunc(input.percent)));
    return bucket < percent
      ? { included: true, reason: `Bucket ${bucket} is inside ${percent}%.` }
      : { included: false, reason: `Bucket ${bucket} is outside ${percent}%.` };
  }
  if (input.mode === "allowlist") {
    return input.allowlist.includes(input.organisationId)
      ? { included: true, reason: "Organisation is on the allowlist." }
      : { included: false, reason: "Organisation is not on the allowlist." };
  }
  if (input.mode === "internal") {
    return input.internal
      ? { included: true, reason: "Internal group." }
      : { included: false, reason: "Not an internal organisation." };
  }
  if (input.mode === "trial") {
    return input.trialing
      ? { included: true, reason: "Trial organisation." }
      : { included: false, reason: "Not on a trial." };
  }
  if (input.mode === "region") {
    return input.organisationRegion != null && input.organisationRegion === input.targetRegion
      ? { included: true, reason: `Region ${input.organisationRegion}.` }
      : { included: false, reason: "Region does not match." };
  }
  return { included: true, reason: "Immediate rollout." };
}

export function removalKeepsHistory(): {
  deletesAccountingData: false;
  access: "hidden_or_read_only";
  noticeDays: number;
} {
  return { deletesAccountingData: false, access: "hidden_or_read_only", noticeDays: 14 };
}
