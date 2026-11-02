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
    expect(sql).toContain("platform_request_break_glass(uuid, text, timestamptz, uuid)");
    const expiry = readFileSync(
      new URL("../../../supabase/migrations/20261102430000_break_glass_expire_audit.sql", import.meta.url),
      "utf8",
    );
    expect(expiry).toContain("break_glass.expire");
    expect(expiry).toContain("private.platform_log");
    expect(expiry).not.toContain("reason");
    const guard = readFileSync(
      new URL("../../../supabase/migrations/20261102440000_company_exists_guards.sql", import.meta.url),
      "utf8",
    );
    expect(guard).toContain("That business was not found");
    expect(guard).toContain("break_glass_grants_company_fk");
    expect(guard).toContain("require_platform('support.manage')");
  });

  it("allows one open grant and keeps the customer log free of the reason", () => {
    expect(() =>
      requestBreakGlass({
        id: "bg-2",
        companyId: "company-1",
        requesterId: "requester",
        reason: "Customer asked for help",
        expiresAt: "2026-11-02T09:00:00.000Z",
        now,
        open: true,
      }),
    ).toThrow(/already has break-glass/);
    expect(() =>
      decideBreakGlass(requested.grant, "approver", "approved", now, true),
    ).toThrow(/already has break-glass/);
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20261102520000_break_glass_one_open.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("break_glass_one_pending");
    expect(sql).toContain("That business already has break-glass access");
    expect(sql).toContain("require_platform('support.manage')");
    expect(sql).not.toContain("jsonb_build_object('action'");
  });
});
