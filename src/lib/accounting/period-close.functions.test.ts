import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware() {
      return this;
    },
    validator() {
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
vi.mock("@/lib/accounting/control-accounts", () => ({
  findControlAccountIds: (_accounts: unknown, kind: string) =>
    kind === "opening_balance" ? ["opening-account"] : [],
}));
vi.mock("@/lib/accounting/ledger-data", () => ({
  loadCompanyMeta: async () => ({ baseCurrency: "GBP", fyEndMonth: 12, fyEndDay: 31 }),
  loadAccountMetas: async () => [],
  fetchAccountBalanceAsOf: vi.fn(),
}));
import { getPeriodCloseFacts } from "./period-close.functions";
import { fetchAccountBalanceAsOf } from "@/lib/accounting/ledger-data";
let tableError: string | null = null;
let journalReversed = false;
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
        is(c: string, v: unknown) {
          filters.push(["is", c, v]);
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
                    : table === "journals"
                      ? !journalReversed &&
                        filters.some(
                          ([op, c, v]) => op === "eq" && c === "status" && v === "posted",
                        ) &&
                        filters.some(
                          ([op, c, v]) =>
                            op === "is" && c === "reversed_by_journal_id" && v === null,
                        )
                        ? { id: "closing-journal" }
                        : null
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
  journalReversed = false;
  vi.mocked(fetchAccountBalanceAsOf).mockReset();
  vi.mocked(fetchAccountBalanceAsOf).mockResolvedValue(0n);
});
const call = (periodEnd: string) =>
  (
    getPeriodCloseFacts as unknown as (
      a: unknown,
    ) => Promise<{ taxReturn: { filed: boolean } | null; yearEnd: { closed: boolean } | null }>
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

describe("year-end checklist integrity", () => {
  it("counts only unreversed, posted closing journals as a completed close", async () => {
    expect((await call("2026-12-31")).yearEnd?.closed).toBe(true);
    journalReversed = true;
    expect((await call("2026-12-31")).yearEnd?.closed).toBe(false);
  });
  it("does not silently round large opening-balance equity amounts", async () => {
    vi.mocked(fetchAccountBalanceAsOf).mockResolvedValue(9007199254740993n);
    await expect(call("2026-10-31")).rejects.toThrow(/Opening balance exceeds/);
  });
  it("surfaces database close-status errors rather than silently assuming open", async () => {
    tableError = "journals";
    await expect(call("2026-12-31")).rejects.toThrow(/Database check unavailable/);
  });
});
