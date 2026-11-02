import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decidePromotion, requestPromotion } from "./config-promotion";

describe("config promotion", () => {
  it("requires a second person and copies nothing", () => {
    const opened = requestPromotion({
      role: "platform_owner",
      sourceId: "company-1",
      targetId: "company-2",
      requesterId: "owner-a",
      reason: "Copy tax",
    });
    expect(opened.copied).toBe(false);
    expect(() =>
      decidePromotion({
        role: "platform_owner",
        request: opened.request,
        approverId: "owner-a",
        decision: "approved",
        reason: "Confirmed",
      }),
    ).toThrow(/second person/);
    const decided = decidePromotion({
      role: "platform_owner",
      request: opened.request,
      approverId: "owner-b",
      decision: "approved",
      reason: "Confirmed",
    });
    expect(decided.copied).toBe(false);
    expect(decided.request.status).toBe("approved");
  });

  it("does not write company settings", () => {
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20261102320000_config_promotion.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("READY-TO-APPLY");
    expect(sql).toContain("copied");
    expect(sql).not.toContain("UPDATE public.companies");
  });
});
