export type BreakGlassStatus = "pending" | "active" | "rejected" | "expired" | "revoked";

export type BreakGlassGrant = {
  id: string;
  companyId: string;
  requesterId: string;
  approverId: string | null;
  status: BreakGlassStatus;
  expiresAt: string;
};

export type CustomerAccessLog = {
  companyId: string;
  action: "requested" | "approved" | "rejected" | "expired" | "revoked";
  at: string;
};

function assertReason(reason: string): void {
  if (reason.trim().length < 3) throw new Error("Record a reason (at least 3 characters)");
}

export function requestBreakGlass(input: {
  id: string;
  companyId: string;
  requesterId: string;
  reason: string;
  expiresAt: string;
  now: Date;
  open?: boolean;
}): { grant: BreakGlassGrant; log: CustomerAccessLog } {
  assertReason(input.reason);
  if (new Date(input.expiresAt).getTime() <= input.now.getTime()) {
    throw new Error("Break-glass access must expire in the future");
  }
  if (input.open) throw new Error("That business already has break-glass access");
  return {
    grant: {
      id: input.id,
      companyId: input.companyId,
      requesterId: input.requesterId,
      approverId: null,
      status: "pending",
      expiresAt: input.expiresAt,
    },
    log: { companyId: input.companyId, action: "requested", at: input.now.toISOString() },
  };
}

export function decideBreakGlass(
  grant: BreakGlassGrant,
  actorId: string,
  decision: "approved" | "rejected",
  now: Date,
  openElsewhere = false,
): { grant: BreakGlassGrant; log: CustomerAccessLog } {
  if (grant.status !== "pending") throw new Error("That break-glass request is no longer pending");
  if (grant.requesterId === actorId) throw new Error("A second person must decide this request");
  if (new Date(grant.expiresAt).getTime() <= now.getTime()) {
    throw new Error("That break-glass request has expired");
  }
  if (decision === "approved" && openElsewhere) {
    throw new Error("That business already has break-glass access");
  }
  const status = decision === "approved" ? "active" : "rejected";
  return {
    grant: { ...grant, status, approverId: actorId },
    log: {
      companyId: grant.companyId,
      action: decision === "approved" ? "approved" : "rejected",
      at: now.toISOString(),
    },
  };
}

export function expireBreakGlass(
  grant: BreakGlassGrant,
  now: Date,
): { grant: BreakGlassGrant; log: CustomerAccessLog } {
  if (grant.status !== "active") throw new Error("Only active break-glass access can expire");
  if (new Date(grant.expiresAt).getTime() > now.getTime()) {
    throw new Error("Break-glass access has not reached its expiry");
  }
  return {
    grant: { ...grant, status: "expired" },
    log: { companyId: grant.companyId, action: "expired", at: now.toISOString() },
  };
}

export function revokeBreakGlass(
  grant: BreakGlassGrant,
  actorId: string,
  now: Date,
): { grant: BreakGlassGrant; log: CustomerAccessLog } {
  if (grant.status !== "active") throw new Error("Only active break-glass access can be revoked");
  if (actorId !== grant.requesterId && actorId !== grant.approverId) {
    throw new Error("Only the requester or approver can revoke break-glass access");
  }
  return {
    grant: { ...grant, status: "revoked" },
    log: { companyId: grant.companyId, action: "revoked", at: now.toISOString() },
  };
}

export function breakGlassAllowsAccess(grant: BreakGlassGrant, now: Date): boolean {
  return grant.status === "active" && new Date(grant.expiresAt).getTime() > now.getTime();
}
