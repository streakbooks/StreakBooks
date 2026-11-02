export type ApprovalRequest = {
  id: string;
  kind: "entitlement";
  status: "pending" | "approved" | "rejected";
  requesterId: string;
  expiresAt: string;
  payload: {
    feature: string;
    scope: string;
    source: string;
    effect: "allow" | "deny";
  };
};

export type ApprovalDecision =
  | { ok: true; status: "approved"; activatesEntitlement: boolean }
  | { ok: true; status: "rejected"; activatesEntitlement: false };

/** Same rule as platform_decide_approval: the requester cannot decide, and a rejection does not activate. */
export function decideApproval(
  request: ApprovalRequest,
  actorId: string,
  decision: "approved" | "rejected",
  now: Date,
): ApprovalDecision {
  if (request.status !== "pending" || new Date(request.expiresAt).getTime() <= now.getTime()) {
    throw new Error("That approval is no longer pending");
  }
  if (request.requesterId === actorId) {
    throw new Error("A second person must decide this request");
  }
  if (decision === "rejected") return { ok: true, status: "rejected", activatesEntitlement: false };
  return {
    ok: true,
    status: "approved",
    activatesEntitlement: request.kind === "entitlement",
  };
}

export function entitlementNeedsSecondApprover(source: string, scope: string): boolean {
  return source === "kill_switch" || scope === "global";
}
