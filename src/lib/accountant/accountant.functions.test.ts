import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { getAccountantChecklist } from "./accountant.functions";
import { assertCompanyPermission } from "@/lib/assert-company-access";
const calls: Array<{ table: string; column: string; value: unknown }> = [];
function sb() {
  return {
    from(table: string) {
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        neq() {
          return query;
        },
        lte(column: string, value: unknown) {
          calls.push({ table, column, value });
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(
            resolve({ data: [], count: table === "purchase_bills" ? 2 : 0, error: null }),
          );
        },
      };
      return query;
    },
  };
}
beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});
describe("dated accountant queue", () => {
  it("scopes every source to the cut-off and includes bills waiting for approval", async () => {
    const fn = getAccountantChecklist as unknown as (
      args: unknown,
    ) => Promise<{ draftBills: number }>;
    const result = await fn({
      data: { companyId: "client", asOf: "2026-10-31" },
      context: { supabase: sb() },
    });
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      expect.anything(),
      "client",
      "accounting.view",
    );
    expect(result.draftBills).toBe(4);
    expect(calls).toContainEqual({
      table: "reconciliation_sessions",
      column: "statement_date",
      value: "2026-10-31",
    });
    expect(calls.filter((c) => c.value === "2026-10-31")).toHaveLength(8);
  });
  it("stops before reading data when company accounting access is denied", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Permission denied"));
    const fn = getAccountantChecklist as unknown as (args: unknown) => Promise<unknown>;
    await expect(
      fn({ data: { companyId: "other", asOf: "2026-10-31" }, context: { supabase: sb() } }),
    ).rejects.toThrow("Permission denied");
    expect(calls).toHaveLength(0);
  });
});
