import { describe, expect, it, vi } from "vitest";
import { loadTaxTreatment } from "./sales-common";

function client(
  result: { data: unknown; error?: { message: string } | null },
  calls: { table?: string; selection?: string; companyId?: string } = {},
) {
  const query = {
    select: vi.fn((selection: string) => {
      calls.selection = selection;
      return query;
    }),
    eq: vi.fn((_column: string, companyId: string) => {
      calls.companyId = companyId;
      return query;
    }),
    maybeSingle: vi.fn(async () => ({ data: result.data, error: result.error ?? null })),
  };
  return {
    from: vi.fn((table: string) => {
      calls.table = table;
      return query;
    }),
  };
}

describe("loadTaxTreatment", () => {
  it("uses the saved company inclusive-pricing setting for sales tax calculation", async () => {
    const calls: { table?: string; selection?: string; companyId?: string } = {};
    const supabase = client({ data: { prices_include_tax: true } }, calls);

    await expect(loadTaxTreatment(supabase as never, "company-1")).resolves.toBe("inclusive");
    expect(calls).toEqual({
      table: "company_tax_settings",
      selection: "prices_include_tax",
      companyId: "company-1",
    });
  });

  it("keeps exclusive pricing as the safe default when the setting is false or absent", async () => {
    await expect(
      loadTaxTreatment(client({ data: { prices_include_tax: false } }) as never, "company-1"),
    ).resolves.toBe("exclusive");
    await expect(loadTaxTreatment(client({ data: null }) as never, "company-1")).resolves.toBe(
      "exclusive",
    );
  });

  it("does not silently change pricing treatment when the settings read fails", async () => {
    await expect(
      loadTaxTreatment(
        client({ data: null, error: { message: "settings unavailable" } }) as never,
        "company-1",
      ),
    ).rejects.toThrow("settings unavailable");
  });
});
