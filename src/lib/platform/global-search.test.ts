import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { globalSearch } from "./global-search";

describe("global search", () => {
  it("asks for two characters and keeps the query out of the audit reason", () => {
    expect(
      globalSearch({
        role: "platform_support",
        query: " n ",
        businesses: [{ id: "c1", name: "Northwind" }],
        users: [],
      }).status,
    ).toBe("short");
    const found = globalSearch({
      role: "platform_support",
      query: "north",
      businesses: [{ id: "c1", name: "Northwind" }],
      users: [{ id: "u1", label: "north@example.com" }],
    });
    expect(found.results).toHaveLength(2);
    expect(found.audit?.reason).toBe("Platform search");
    expect(JSON.stringify(found.audit)).not.toContain("north");
  });

  it("refuses finance and does not read ledger tables", () => {
    expect(() =>
      globalSearch({ role: "platform_finance", query: "north", businesses: [], users: [] }),
    ).toThrow(/permission/);
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20261102250000_global_search.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("READY-TO-APPLY");
    expect(sql).toContain("length(_term) < 2");
    expect(sql).not.toContain("journal_lines");
  });
});
