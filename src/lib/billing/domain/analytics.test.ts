import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyticsRange, netRevenueMinor, saveRate } from "./analytics";

describe("analytics ranges", () => {
  const now = new Date("2026-11-05T12:00:00Z");

  it("starts this month at the first day in UTC", () => {
    expect(analyticsRange("month", now)).toEqual({
      from: "2026-11-01T00:00:00.000Z",
      to: "2026-11-05T12:00:00.000Z",
    });
  });

  it("stays within the database's one-year limit", () => {
    const range = analyticsRange("365d", now);
    expect(Date.parse(range.to) - Date.parse(range.from)).toBeLessThanOrEqual(366 * 86_400_000);
    expect(analyticsRange("30d", now).from).toBe("2026-10-06T12:00:00.000Z");
  });
});

describe("derived figures", () => {
  it("subtracts credited net revenue", () => {
    expect(netRevenueMinor({ netMinor: 84661, creditedNetMinor: 42330 })).toBe(42331);
  });

  it("reports the save rate only when cancellations were requested", () => {
    expect(saveRate(0, 0)).toBeNull();
    expect(saveRate(4, 1)).toBe(0.25);
    expect(saveRate(1, 3)).toBe(1);
  });
});

describe("analytics migration", () => {
  const sql = readFileSync("supabase/migrations/20261105231127_billing_analytics.sql", "utf8");

  it("requires a platform permission and keeps the service variant off clients", () => {
    expect(sql).toContain("PERFORM private.require_platform('billing.view')");
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.billing_api_analytics\(timestamptz, timestamptz\) FROM PUBLIC, anon, authenticated/,
    );
  });

  it("reuses the MRR capture rule and excludes demo organisations", () => {
    expect(sql).toContain("FROM public.mrr_movements m");
    expect(sql).toContain("NOT c.is_demo AND s.status = 'active'");
    expect(sql).not.toMatch(/fx_convert|exchange_rates/);
  });
});
