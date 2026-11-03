import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const directory = new URL("../../../supabase/migrations/", import.meta.url);

function laterMigrations(): { name: string; sql: string }[] {
  return readdirSync(directory)
    .filter((name) => name >= "20261102190000" && name.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(new URL(name, directory), "utf8") }));
}

describe("unapplied platform authorisation", () => {
  it("requires a platform permission and locks each new table", () => {
    const files = laterMigrations();
    expect(files.length).toBeGreaterThanOrEqual(44);
    expect(files.some((file) => file.name.startsWith("20261102610000"))).toBe(true);
    const combined = files.map((file) => file.sql).join("\n");
    const names = new Set<string>();
    for (const file of files) {
      for (const match of file.sql.matchAll(
        /CREATE (?:OR REPLACE )?FUNCTION public\.(platform_[a-z0-9_]+)\(/g,
      )) {
        const name = match[1] ?? "";
        names.add(name);
        const start = (match.index ?? 0) + match[0].length;
        const body = file.sql.slice(start, file.sql.indexOf("$$;", start));
        expect(body, `${file.name} ${name}`).toMatch(
          /require_platform|platform_can|SECURITY INVOKER/,
        );
      }
      for (const match of file.sql.matchAll(/CREATE TABLE public\.([a-z0-9_]+)/g)) {
        const table = match[1] ?? "";
        expect(file.sql, table).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
        expect(file.sql, table).toContain(`REVOKE ALL ON public.${table}`);
      }
    }
    for (const name of names) {
      expect(combined, name).toMatch(new RegExp(`REVOKE ALL ON FUNCTION[^;]*public\\.${name}\\(`));
    }
    expect(combined).toContain("Company membership is required");
  });
});
