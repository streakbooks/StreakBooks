export const MEMBER_STATUSES = [
  "prospect",
  "trial",
  "active",
  "inactive",
  "frozen",
  "suspended",
  "expired",
  "cancelled",
  "archived",
] as const;

export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const MEMBERSHIP_STATUSES = [
  "pending_payment",
  "trial",
  "active",
  "frozen",
  "suspended",
  "expired",
  "cancelled",
] as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

const MEMBER_TRANSITIONS: Record<MemberStatus, readonly MemberStatus[]> = {
  prospect: ["trial", "active", "archived"],
  trial: ["active", "expired", "cancelled", "archived"],
  active: ["inactive", "frozen", "suspended", "expired", "cancelled"],
  inactive: ["active", "archived"],
  frozen: ["active", "cancelled", "expired"],
  suspended: ["active", "cancelled"],
  expired: ["active", "archived"],
  cancelled: ["active", "archived"],
  archived: [],
};

const MEMBERSHIP_TRANSITIONS: Record<MembershipStatus, readonly MembershipStatus[]> = {
  pending_payment: ["active", "cancelled"],
  trial: ["active", "expired", "cancelled"],
  active: ["frozen", "suspended", "expired", "cancelled"],
  frozen: ["active", "cancelled", "expired"],
  suspended: ["active", "cancelled"],
  expired: ["active"],
  cancelled: ["active"],
};

export function assertTransition<T extends string>(
  current: T,
  next: T,
  allowed: Record<T, readonly T[]>,
  label: string,
): void {
  if (current === next) return;
  if (!allowed[current]?.includes(next)) {
    throw new Error(`${label} cannot move from ${current} to ${next}`);
  }
}

export function assertMemberTransition(current: MemberStatus, next: MemberStatus): void {
  assertTransition(current, next, MEMBER_TRANSITIONS, "Member");
}

export function assertMembershipTransition(
  current: MembershipStatus,
  next: MembershipStatus,
): void {
  assertTransition(current, next, MEMBERSHIP_TRANSITIONS, "Membership");
}
