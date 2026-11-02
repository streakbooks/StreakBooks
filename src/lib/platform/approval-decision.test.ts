import { describe, expect, it } from "vitest";
import {
  decideApproval,
  entitlementNeedsSecondApprover,
  type ApprovalRequest,
} from "./approval-decision";

const now = new Date("2026-11-02T08:00:00Z");
const request: ApprovalRequest = {
  id: "11111111-1111-1111-1111-111111111111",
  kind: "entitlement",
  status: "pending",
  requesterId: "requester",
  expiresAt: "2026-11-09T08:00:00Z",
  payload: { feature: "ai_queries", scope: "global", source: "kill_switch", effect: "deny" },
};

describe("second approver", () => {
  it("queues a kill switch and a global change", () => {
    expect(entitlementNeedsSecondApprover("kill_switch", "business")).toBe(true);
    expect(entitlementNeedsSecondApprover("grant", "global")).toBe(true);
    expect(entitlementNeedsSecondApprover("grant", "business")).toBe(false);
  });

  it("refuses the requester and lets a second person approve", () => {
    expect(() => decideApproval(request, "requester", "approved", now)).toThrow(/second person/);
    expect(decideApproval(request, "approver", "approved", now)).toEqual({
      ok: true,
      status: "approved",
      activatesEntitlement: true,
    });
  });

  it("does not activate a rejected or expired request", () => {
    expect(decideApproval(request, "approver", "rejected", now)).toEqual({
      ok: true,
      status: "rejected",
      activatesEntitlement: false,
    });
    expect(() =>
      decideApproval(request, "approver", "approved", new Date("2026-11-10T08:00:00Z")),
    ).toThrow(/no longer pending/);
  });
});
