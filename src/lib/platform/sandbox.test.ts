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
  });
});
