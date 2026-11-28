import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { fiscalYearContaining } from "./fiscal-year";
import { loadCompanyMeta } from "./ledger-data";

describe("loadCompanyMeta fiscal-year settings", () => {
  it("passes the saved fiscal year end through to accounting date ranges", async () => {
    const row = {
      id: "company-id",
      name: "Example Co",
      base_currency: "INR",
      country_code: "IN",
      fiscal_year_end_month: 6,
      fiscal_year_end_day: 30,
      is_demo: false,
      locale: "en-IN",
    };
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    };
    const client = { from: vi.fn(() => query) } as unknown as SupabaseClient<Database>;

    const meta = await loadCompanyMeta(client, "company-id");

    expect(meta.fyEndMonth).toBe(6);
    expect(meta.fyEndDay).toBe(30);
    expect(fiscalYearContaining("2026-08-01", meta.fyEndMonth, meta.fyEndDay)).toEqual({
      start: "2026-07-01",
      end: "2027-06-30",
    });
    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining("fiscal_year_end_month, fiscal_year_end_day"),
    );
  });
});
