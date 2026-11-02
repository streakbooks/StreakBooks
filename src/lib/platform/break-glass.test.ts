import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  breakGlassAllowsAccess,
  decideBreakGlass,
  expireBreakGlass,
  requestBreakGlass,
  revokeBreakGlass,
} from "./break-glass";

const now = new Date("2026-11-02T08:00:00.000Z");
const later = new Date("2026-11-02T10:00:00.000Z");

describe("break-glass access", () => {
  const requested = requestBreakGlass({
    id: "bg-1",
    companyId: "company-1",
    requesterId: "requester",
    reason: "Customer asked for help",
    expiresAt: "2026-11-02T09:00:00.000Z",
    now,
  });

  it("requests access and writes a customer-visible log without the reason", () => {
    expect(requested.grant.status).toBe("pending");
    expect(requested.log).toEqual({
      companyId: "company-1",
      action: "requested",
      at: now.toISOString(),
    });
    expect(JSON.stringify(requested.log)).not.toContain("Customer asked");
  });

  it("requires a second person to approve and then allows access", () => {
    expect(() => decideBreakGlass(requested.grant, "requester", "approved", now)).toThrow(
      /second person/,
    );
    const approved = decideBreakGlass(requested.grant, "approver", "approved", now);
    expect(approved.log.action).toBe("approved");
    expect(breakGlassAllowsAccess(approved.grant, now)).toBe(true);
  });

  it("expires and revokes access, and both appear on the customer log", () => {
    const approved = decideBreakGlass(requested.grant, "approver", "approved", now).grant;
    const expired = expireBreakGlass(approved, later);
    expect(expired.grant.status).toBe("expired");
    expect(expired.log.action).toBe("expired");
    expect(breakGlassAllowsAccess(expired.grant, later)).toBe(false);
    const revoked = revokeBreakGlass(approved, "approver", now);
    expect(revoked.grant.status).toBe("revoked");
    expect(revoked.log.action).toBe("revoked");
    expect(breakGlassAllowsAccess(revoked.grant, now)).toBe(false);
  });

  it("keeps the database functions unapplied and customer-visible", () => {
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20261102190000_break_glass.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("READY-TO-APPLY");
    expect(sql).toContain("company_break_glass_log");
    expect(sql).toContain("A second person must decide this request");
  });
});
