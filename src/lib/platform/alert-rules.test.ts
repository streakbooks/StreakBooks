import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createAlertRule, evaluateAlert } from "./alert-rules";

describe("admin alert rules", () => {
  it("does not fire when the observed value is missing", () => {
    expect(evaluateAlert({ role: "platform_support", observed: null, threshold: 0 })).toEqual({
      status: "unknown",
      fired: false,
    });
    expect(evaluateAlert({ role: "platform_support", observed: 2, threshold: 1 }).fired).toBe(true);
  });

  it("lets support read and only an owner create", () => {
    expect(
      createAlertRule({
        role: "platform_owner",
        name: "Failed webhooks",
        threshold: 3,
        reason: "Watch",
      }),
    ).toMatchObject({
      stored: false,
      firesOnMissing: false,
    });
    expect(() =>
      createAlertRule({
        role: "platform_support",
        name: "Failed webhooks",
        threshold: 3,
        reason: "Watch",
      }),
    ).toThrow(/permission/);
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20261102270000_alert_rules.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("READY-TO-APPLY");
    expect(sql).toContain("private.require_platform('notifications.manage')");
  });
});
