import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openIncident, recordRelease, resolveIncident } from "./incidents";

describe("incidents and releases", () => {
  it("resolves an incident without deleting it and does not deploy a release", () => {
    const opened = openIncident({
      role: "platform_support",
      title: "Sign-in errors",
      reason: "Customers",
    });
    expect(opened.deleted).toBe(false);
    const resolved = resolveIncident({
      role: "platform_owner",
      status: opened.status,
      reason: "Fixed",
    });
    expect(resolved).toMatchObject({ status: "resolved", deleted: false });
    expect(
      recordRelease({ role: "platform_owner", version: "1.4.0", reason: "Notes" }),
    ).toMatchObject({
      recorded: false,
      deployed: false,
    });
    expect(() =>
      recordRelease({ role: "platform_owner", version: "latest; rm", reason: "Notes" }),
    ).toThrow(/version/);
  });

  it("keeps the tables unapplied", () => {
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20261102290000_incidents.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("READY-TO-APPLY");
    expect(sql.toLowerCase()).not.toContain("delete from");
    expect(() =>
      openIncident({ role: "platform_finance", title: "Sign-in errors", reason: "Customers" }),
    ).toThrow(/permission/);
  });
});
