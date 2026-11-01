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
vi.mock("@/lib/accounting/posting-engine", () => ({ ensureFiscalPeriodForDate: vi.fn() }));
vi.mock("@/lib/accounting/ledger-data", () => ({
  loadCompanyMeta: async () => ({ baseCurrency: "GBP", fyEndMonth: 12, fyEndDay: 31 }),
  loadAccountMetas: async () => [],
  fetchAccountBalanceAsOf: vi.fn(),
}));
import { getPeriodCloseFacts } from "./period-close.functions";
let tableError: string | null = null;
function client() {
  return {
    from(table: string) {
      const filters: Array<[string, string, unknown]> = [];
      const query = {
        select() {
          return query;
        },
        eq(c: string, v: unknown) {
          filters.push(["eq", c, v]);
          return query;
        },
        in() {
          return query;
        },
        gte(c: string, v: unknown) {
          filters.push(["gte", c, v]);
          return query;
        },
        lte(c: string, v: unknown) {
          filters.push(["lte", c, v]);
          return query;
        },
        limit() {
          return query;
        },
        maybeSingle() {
          return query;
        },
        then(resolve: (v: unknown) => unknown) {
          const futureReturn = { period_start: "2026-11-01", period_end: "2026-11-30" };
          const covered =
            filters.some(
              ([op, c, v]) =>
                op === "lte" && c === "period_start" && futureReturn.period_start <= String(v),
            ) &&
            filters.some(
              ([op, c, v]) =>
                op === "gte" && c === "period_end" && futureReturn.period_end >= String(v),
            );
          return Promise.resolve(
            resolve({
              count: 0,
              error: tableError === table ? { message: "Database check unavailable" } : null,
              data:
                table === "company_tax_settings"
                  ? { tax_regime: "vat" }
                  : table === "tax_returns"
                    ? covered
                      ? [{ id: "future" }]
                      : []
                    : [],
            }),
          );
        },
      };
      return query;
    },
  };
}
beforeEach(() => {
  tableError = null;
});
const call = (periodEnd: string) =>
  (
    getPeriodCloseFacts as unknown as (
      a: unknown,
    ) => Promise<{ taxReturn: { filed: boolean } | null }>
  )({ data: { companyId: "client", periodEnd }, context: { supabase: client() } });
describe("close facts evidence", () => {
  it("does not treat a future tax return as covering an earlier month end", async () => {
    expect((await call("2026-10-31")).taxReturn?.filed).toBe(false);
    expect((await call("2026-11-30")).taxReturn?.filed).toBe(true);
  });
  it("surfaces unavailable tax evidence instead of representing it as not applicable", async () => {
    tableError = "tax_returns";
    await expect(call("2026-10-31")).rejects.toThrow("Database check unavailable");
    tableError = "company_tax_settings";
    await expect(call("2026-10-31")).rejects.toThrow("Database check unavailable");
  });
});
