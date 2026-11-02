import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSegment, tagCompany } from "./segments";

describe("segments and tags", () => {
  it("names a segment and tags a business without storing either yet", () => {
    expect(createSegment({ role: "platform_owner", name: " Trial ", reason: "Cohort" })).toEqual({
      stored: false,
      name: "Trial",
      audit: { action: "segment.create", reason: "Cohort" },
    });
    expect(
      tagCompany({
        role: "platform_owner",
        segmentName: "Trial",
        companyId: "company-1",
        reason: "Cohort",
      }).stored,
    ).toBe(false);
  });

  it("refuses support and a one-letter name", () => {
    expect(() =>
      createSegment({ role: "platform_support", name: "Trial", reason: "Cohort" }),
    ).toThrow(/permission/);
    expect(() => createSegment({ role: "platform_owner", name: " T ", reason: "Cohort" })).toThrow(
      /Name/,
    );
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20261102260000_segments.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("READY-TO-APPLY");
    expect(sql).toContain("private.require_platform('businesses.manage')");
    expect(sql).not.toContain("journal_lines");
  });
});
