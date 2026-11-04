import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { countConfiguredForeignCurrencies } from "./foreign-currency-safety";

function mockClient(result: { count: number | null; error: { message: string } | null }) {
  const eq = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return {
    client: { from } as unknown as SupabaseClient<Database>,
    from,
    select,
    eq,
  };
}

describe("Settings Centre multicurrency safety reads", () => {
  const companyId = "00000000-0000-4000-8000-000000000001";

  it("returns the configured foreign-currency count", async () => {
    const { client, from, select, eq } = mockClient({ count: 2, error: null });
    await expect(countConfiguredForeignCurrencies(client, companyId)).resolves.toBe(2);
    expect(from).toHaveBeenCalledWith("company_currencies");
    expect(select).toHaveBeenCalledWith("currency_code", { count: "exact", head: true });
    expect(eq).toHaveBeenCalledWith("company_id", companyId);
  });

  it("accepts a verified zero", async () => {
    const { client } = mockClient({ count: 0, error: null });
    await expect(countConfiguredForeignCurrencies(client, companyId)).resolves.toBe(0);
  });

  it("rejects missing counts instead of assuming no foreign currencies", async () => {
    const { client } = mockClient({ count: null, error: null });
    await expect(countConfiguredForeignCurrencies(client, companyId)).rejects.toThrow(
      "Unable to verify configured foreign currencies",
    );
  });

  it("surfaces database failures before permitting changes", async () => {
    const { client } = mockClient({ count: null, error: { message: "permission denied" } });
    await expect(countConfiguredForeignCurrencies(client, companyId)).rejects.toThrow(
      "permission denied",
    );
  });
});
