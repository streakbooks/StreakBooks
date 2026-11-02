import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decideClosure, requestClosure } from "./closure";

describe("closure", () => {
  it("archives only after a second person decides and never deletes", () => {
    const opened = requestClosure({
      role: "platform_owner",
      companyId: "company-1",
      requesterId: "owner-a",
      reason: "Customer left",
    });
    expect(opened.deleted).toBe(false);
    expect(opened.request.status).toBe("pending");
    expect(() =>
      decideClosure({
        role: "platform_owner",
        request: opened.request,
        approverId: "owner-a",
        decision: "archived",
        reason: "Confirmed",
      }),
    ).toThrow(/second person/);
    const closed = decideClosure({
      role: "platform_owner",
      request: opened.request,
      approverId: "owner-b",
      decision: "archived",
      reason: "Confirmed",
    });
    expect(closed.request.status).toBe("archived");
    expect(closed.deleted).toBe(false);
  });

  it("keeps the archive unapplied and does not delete rows", () => {
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20261102220000_company_closure.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("READY-TO-APPLY");
    expect(sql).toContain("A second person must decide this request");
    expect(sql.toLowerCase()).not.toContain("delete from");
  });

  it("refuses finance", () => {
    expect(() =>
      requestClosure({
        role: "platform_finance",
        companyId: "company-1",
        requesterId: "owner-a",
        reason: "Customer left",
      }),
    ).toThrow(/permission/);
  });
});
