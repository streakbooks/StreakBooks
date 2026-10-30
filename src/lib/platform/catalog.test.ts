import { describe, expect, it } from "vitest";
import {
  sectionSchema,
  listSchema,
  mutationSchema,
  overviewSchema,
  visibleSections,
  rowsCsv,
  csvCell,
  sections,
} from "./catalog";
describe("platform request boundaries", () => {
  it("rejects unknown navigation and defaults only inside route handling", () => {
    expect(sectionSchema.safeParse("anything").success).toBe(false);
    expect(sections).toHaveLength(16);
  });
  it("limits list searches and pagination and rejects SQL sort fragments", () => {
    for (const input of [
      { resource: "users", page: -1 },
      { resource: "users", search: "x".repeat(161) },
      { resource: "users", sort: "desc; drop table profiles" },
      { resource: "auth.users" },
    ])
      expect(listSchema.safeParse(input).success).toBe(false);
    expect(listSchema.parse({ resource: "businesses" })).toMatchObject({
      page: 0,
      sort: "desc",
      search: "",
    });
  });
  it("requires known mutation actions, a valid target and an audit reason", () => {
    expect(
      mutationSchema.safeParse({ action: "user.update", id: "not-a-uuid", reason: "reason" })
        .success,
    ).toBe(false);
    expect(mutationSchema.safeParse({ action: "owner.create", reason: "escalation" }).success).toBe(
      false,
    );
    expect(mutationSchema.safeParse({ action: "user.revoke", reason: "  " }).success).toBe(false);
    expect(
      mutationSchema.parse({
        action: "role.assign",
        reason: "Valid reason",
        payload: { user_id: "id" },
      }),
    ).toMatchObject({ id: null, reason: "Valid reason" });
  });
  it("rejects reversed metric windows", () => {
    expect(overviewSchema.safeParse({ from: "2026-10-30", to: "2026-09-01" }).success).toBe(false);
  });
  it("only exposes authorized navigation", () => {
    expect(visibleSections(["businesses.view", "users.manage"]).map((s) => s[0])).toEqual([
      "businesses",
    ]);
    expect(visibleSections([])).toEqual([]);
  });
});
describe("administrative CSV exports", () => {
  it("neutralizes spreadsheet commands including whitespace-prefixed formulas", () => {
    for (const value of ["=cmd()", "+SUM(1,2)", "@command", "-1+cmd()", '\t=HYPERLINK("evil")'])
      expect(csvCell(value)).toMatch(/^"'/);
  });
  it("quotes multiline data and unions columns instead of omitting later fields", () => {
    const csv = rowsCsv([
      { id: "one", name: 'A,"B"\nC' },
      { id: "two", status: "active" },
    ]);
    expect(csv).toContain('"id","name","status"');
    expect(csv).toContain('"A,""B""\nC"');
    expect(csv).toContain('"two","","active"');
  });
  it("serializes structured values and nulls", () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell({ active: true })).toBe('"{""active"":true}"');
  });
});
