import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { billingCountries } from "@/lib/billing/billing-countries";
import { ISO_COUNTRIES, ISO_CURRENCIES } from "./iso-reference-data";

const migrationsDir = path.resolve(__dirname, "../../../../supabase/migrations");
const seedFile = readdirSync(migrationsDir).find((f) => f.endsWith("_billing_reference_data.sql"));

describe("ISO reference data", () => {
  it("has unique, well-formed currency codes with ISO exponents", () => {
    const codes = ISO_CURRENCIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of ISO_CURRENCIES) {
      expect(c.code).toMatch(/^[A-Z]{3}$/);
      expect(c.numericCode).toMatch(/^\d{3}$/);
      expect([0, 2, 3, 4]).toContain(c.minorUnits);
    }
  });

  it("covers every billing country and maps each to a known currency", () => {
    expect(ISO_COUNTRIES.map((c) => c.code).sort()).toEqual(
      billingCountries.map((c) => c.code).sort(),
    );
    const known = new Set(ISO_CURRENCIES.map((c) => c.code));
    for (const country of ISO_COUNTRIES) {
      if (country.defaultCurrency !== null) expect(known.has(country.defaultCurrency)).toBe(true);
    }
    expect(ISO_COUNTRIES.filter((c) => c.defaultCurrency === null).map((c) => c.code)).toEqual([
      "AQ",
    ]);
  });

  it("matches the database seed in the reference-data migration exactly", () => {
    expect(seedFile).toBeDefined();
    const sql = readFileSync(path.join(migrationsDir, seedFile as string), "utf8");
    const currencyRows = [
      ...sql.matchAll(/^\s+\('([A-Z]{3})', '(\d{3})', '((?:[^']|'')+)', (\d)\)/gm),
    ].map((m) => ({
      code: m[1],
      numericCode: m[2],
      name: (m[3] as string).replaceAll("''", "'"),
      minorUnits: Number(m[4]),
    }));
    const countryRows = [
      ...sql.matchAll(/^\s+\('([A-Z]{2})', '((?:[^']|'')+)', (?:'([A-Z]{3})'|NULL)\)/gm),
    ].map((m) => ({
      code: m[1],
      name: (m[2] as string).replaceAll("''", "'"),
      defaultCurrency: m[3] ?? null,
    }));
    expect(currencyRows).toEqual(ISO_CURRENCIES);
    expect(countryRows).toEqual(ISO_COUNTRIES);
  });

  it("keeps the launch-critical facts the pricing engine depends on", () => {
    const byCode = new Map(ISO_COUNTRIES.map((c) => [c.code, c.defaultCurrency]));
    expect(byCode.get("IN")).toBe("INR");
    expect(byCode.get("US")).toBe("USD");
    expect(byCode.get("GB")).toBe("GBP");
    expect(byCode.get("AU")).toBe("AUD");
    expect(byCode.get("CA")).toBe("CAD");
  });
});
