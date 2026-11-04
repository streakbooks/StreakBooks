import { describe, expect, it } from "vitest";
import {
  buildContactsCsv,
  csvEscape,
  dueDateFromTerms,
  duplicateScore,
  normalizeContactName,
  parseContactsCsv,
  resolveContactSort,
  nextContactSort,
} from "./contact-helpers";

describe("contact-helpers", () => {
  it("normalizes names", () => {
    expect(normalizeContactName("  Acme   Ltd ")).toBe("acme ltd");
  });

  it("computes due dates from terms", () => {
    expect(dueDateFromTerms("2026-01-01", 30)).toBe("2026-01-31");
    expect(dueDateFromTerms("2026-01-01", 0)).toBe("2026-01-01");
  });

  it("escapes CSV and formula injection", () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("=1+1")).toBe("'=1+1");
  });

  it("round-trips CSV parse", () => {
    const csv = buildContactsCsv(
      [{ name: "A", kind: "customer", email: null }],
      ["name", "kind", "email"],
    );
    const { headers, rows } = parseContactsCsv(csv);
    expect(headers).toEqual(["name", "kind", "email"]);
    expect(rows[0]?.[0]).toBe("A");
  });

  it("parses multiline quoted notes, commas, escaped quotes and CRLF", () => {
    const csv = 'name,notes,email\r\n"Acme, Ltd","Line one\r\nLine ""two""",hello@example.com\r\n';
    expect(parseContactsCsv(csv)).toEqual({
      headers: ["name", "notes", "email"],
      rows: [["Acme, Ltd", 'Line one\r\nLine "two"', "hello@example.com"]],
    });
  });

  it("rejects unterminated or invalid quoted CSV", () => {
    expect(() => parseContactsCsv('name,notes\nA,"unclosed')).toThrow("Unclosed quoted");
    expect(() => parseContactsCsv('name,notes\nA,"abc"garbage')).toThrow(
      "Unexpected text after quoted",
    );
  });

  it("prevents CSV formulas even with leading whitespace", () => {
    expect(csvEscape("  =SUM(A1:A2)")).toBe("'  =SUM(A1:A2)");
    expect(csvEscape("\t+1+1")).toBe("'\t+1+1");
  });

  it("only resolves safe contact sorting columns", () => {
    expect(resolveContactSort("name_desc")).toEqual({ column: "name", ascending: false });
    expect(resolveContactSort("account_asc")).toEqual({
      column: "account_number",
      ascending: true,
    });
    expect(resolveContactSort("roles_desc")).toEqual({ column: "kind", ascending: false });
    expect(resolveContactSort("city_asc")).toEqual({
      column: "billing_city",
      ascending: true,
    });
    expect(resolveContactSort("state_desc")).toEqual({
      column: "billing_region",
      ascending: false,
    });
    expect(resolveContactSort("country_asc")).toEqual({
      column: "billing_country",
      ascending: true,
    });
    expect(resolveContactSort("credit_desc")).toEqual({
      column: "credit_limit_minor",
      ascending: false,
    });
    expect(resolveContactSort("email_asc")).toEqual({ column: "email", ascending: true });
    expect(resolveContactSort("phone_desc")).toEqual({ column: "phone", ascending: false });
    expect(resolveContactSort("terms_asc")).toEqual({
      column: "payment_terms_days",
      ascending: true,
    });
    expect(resolveContactSort("recent")).toEqual({ column: "created_at", ascending: false });
    expect(resolveContactSort("updated")).toEqual({ column: "updated_at", ascending: false });
    expect(resolveContactSort("", "recent")).toEqual({
      column: "created_at",
      ascending: false,
    });
    expect(resolveContactSort("", "updated")).toEqual({
      column: "updated_at",
      ascending: false,
    });
    expect(resolveContactSort("sql-injection")).toEqual({ column: "name", ascending: true });
  });

  it("toggles ascending and descending when clicking a column header", () => {
    expect(nextContactSort("default", "name")).toBe("name_desc");
    expect(nextContactSort("name_desc", "name")).toBe("name_asc");
    expect(nextContactSort("name_asc", "terms")).toBe("terms_asc");
    expect(nextContactSort("terms_asc", "terms")).toBe("terms_desc");
    expect(nextContactSort("default", "name", "recent")).toBe("name_asc");
  });

  it("scores duplicates", () => {
    const { score, reasons } = duplicateScore(
      { name: "Acme", email: "a@x.com", tax_number: "T1" },
      { name: "Acme", email: "a@x.com", tax_number: "T1" },
    );
    expect(score).toBeGreaterThanOrEqual(90);
    expect(reasons).toContain("Same name");
    expect(reasons).toContain("Same email");
  });
});
