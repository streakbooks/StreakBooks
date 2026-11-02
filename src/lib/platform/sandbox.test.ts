import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { requestSandbox } from "./sandbox";

describe("sandbox tenants", () => {
  it("does not create a company or a second posting engine", () => {
    expect(
      requestSandbox({ role: "platform_owner", name: "Practice sandbox", reason: "Training" }),
    ).toEqual({
      created: false,
      postingDiffers: false,
      name: "Practice sandbox",
      audit: { action: "sandbox.request", reason: "Training" },
    });
    expect(() =>
      requestSandbox({ role: "platform_support", name: "Practice sandbox", reason: "Training" }),
    ).toThrow(/permission/);
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20261102330000_sandbox_requests.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("READY-TO-APPLY");
    expect(sql).toContain("postingDiffers");
    expect(sql).not.toContain("INSERT INTO public.companies");
    expect(() =>
      requestSandbox({
        role: "platform_owner",
        name: "Practice sandbox",
        reason: "Training",
        requested: true,
      }),
    ).toThrow(/already been requested/);
    const once = readFileSync(
      new URL("../../../supabase/migrations/20261102570000_sandbox_name_once.sql", import.meta.url),
      "utf8",
    );
    expect(once).toContain("platform_sandbox_requests_name_key");
    expect(once).toContain("That sandbox has already been requested");
    expect(once).toContain("'postingDiffers', false");
    expect(once).toContain("require_platform('businesses.manage')");
    expect(once).not.toContain("INSERT INTO public.companies");
  });
});
