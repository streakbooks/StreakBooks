import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("data export", () => {
  it("uses the existing platform export and records an audit row", () => {
    const sql = readFileSync(
      new URL(
        "../../../supabase/migrations/20261030150410_superadmin_action_permissions_and_exports.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(sql).toContain("private.require_platform_action(permission,'export')");
    expect(sql).toContain("private.platform_log('export'");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.platform_export(text,text,integer),private.platform_export(text,text,integer) FROM PUBLIC,anon",
    );
  });
});
