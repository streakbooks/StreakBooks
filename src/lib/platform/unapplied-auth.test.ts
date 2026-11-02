import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const directory = new URL("../../../supabase/migrations/", import.meta.url);

function laterMigrations(): { name: string; sql: string }[] {
  return readdirSync(directory)
    .filter((name) => /^20261102(19|2\d|3\d|4\d).*\.sql$/.test(name))
    .sort()
    .map((name) => ({ name, sql: readFileSync(new URL(name, directory), "utf8") }));
}

describe("unapplied platform authorisation", () => {
  it("requires a platform permission and locks each new table", () => {
    const files = laterMigrations();
    expect(files.length).toBeGreaterThan(10);
    const combined = files.map((file) => file.sql).join("\n");
    const names = new Set<string>();
    for (const file of files) {
      for (const match of file.sql.matchAll(
        /CREATE (?:OR REPLACE )?FUNCTION public\.(platform_[a-z0-9_]+)\(/g,
      )) {
        const name = match[1] ?? "";
        names.add(name);
        const start = match.index ?? 0;
        const body = file.sql.slice(start, file.sql.indexOf("$$;", start));
        expect(body, `${file.name} ${name}`).toMatch(/require_platform|platform_can/);
      }
      for (const match of file.sql.matchAll(/CREATE TABLE public\.([a-z0-9_]+)/g)) {
        const table = match[1] ?? "";
        expect(file.sql, table).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
        expect(file.sql, table).toContain(`REVOKE ALL ON public.${table}`);
      }
    }
    for (const name of names) {
      expect(combined, name).toContain(`REVOKE ALL ON FUNCTION public.${name}`);
    }
    expect(combined).toContain("Company membership is required");
  });
});
