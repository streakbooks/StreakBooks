import { describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware() {
      return this;
    },
    inputValidator() {
      return this;
    },
    handler(fn: unknown) {
      return fn;
    },
  }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/assert-company-access", () => ({ assertCompanyPermission: vi.fn() }));
import { findCorrectionLines } from "./correction.functions";
describe("source currency display", () => {
  it("returns the actual currency precision even for excluded foreign lines", async () => {
    const builder = {
      select() {
        return builder;
      },
      in: async () => ({
        data: [
          { code: "JPY", decimal_places: 0 },
          { code: "KWD", decimal_places: 3 },
        ],
        error: null,
      }),
    };
    const supabase = {
      rpc: async () => ({
        data: {
          rows: [
            { id: "jpy", currency: "JPY", debit_minor: "10000", credit_minor: "0" },
            { id: "kwd", currency: "KWD", debit_minor: "1234", credit_minor: "0" },
          ],
          has_more: false,
          page: 0,
        },
        error: null,
      }),
      from: () => builder,
    };
    const call = findCorrectionLines as unknown as (
      args: unknown,
    ) => Promise<{ rows: Array<{ currency: string; currency_decimals: number }> }>;
    const result = await call({
      data: { companyId: "client", filters: {} },
      context: { supabase },
    });
    expect(result.rows.map((r) => [r.currency, r.currency_decimals])).toEqual([
      ["JPY", 0],
      ["KWD", 3],
    ]);
  });
  it("fails clearly if a source currency has no reference precision", async () => {
    const builder = {
      select() {
        return builder;
      },
      in: async () => ({ data: [], error: null }),
    };
    const supabase = {
      rpc: async () => ({
        data: { rows: [{ currency: "JPY" }], has_more: false, page: 0 },
        error: null,
      }),
      from: () => builder,
    };
    const call = findCorrectionLines as unknown as (args: unknown) => Promise<unknown>;
    await expect(
      call({ data: { companyId: "client", filters: {} }, context: { supabase } }),
    ).rejects.toThrow("Currency precision is unavailable");
  });
});
