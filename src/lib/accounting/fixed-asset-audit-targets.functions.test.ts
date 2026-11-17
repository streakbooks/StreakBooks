import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (input: unknown) => unknown = (value) => value;
    const chain = {
      middleware() {
        return chain;
      },
      inputValidator(fn: (input: unknown) => unknown) {
        validate = fn;
        return chain;
      },
      handler(fn: (args: { data: unknown; context: unknown }) => Promise<unknown>) {
        return (args: { data: unknown; context: unknown }) =>
          fn({ ...args, data: validate(args.data) });
      },
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/assert-company-access", () => ({ assertCompanyPermission: vi.fn() }));

import { assertCompanyPermission } from "@/lib/assert-company-access";
import { listFixedAssetPostingAuditTargets } from "./fixed-asset-audit-targets.functions";

const company = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const assetId = "33333333-3333-4333-8333-333333333333";
const initial = {
  asset_depreciation_runs: [
    {
      id: runId,
      company_id: company,
      period_end: "2026-10-31",
      asset_count: 2,
      journal_id: "journal1",
    },
  ],
  fixed_assets: [
    {
      id: assetId,
      company_id: company,
      status: "disposed",
      asset_number: "FA-01",
      name: "Equipment",
      disposal_date: "2026-11-02",
      disposal_journal_id: "journal2",
    },
  ],
};
let tables: Record<string, unknown[]>;
let failTable: string | null;
const filters = vi.fn();
const from = vi.fn((table: string) => {
  const predicates: Array<(row: Record<string, unknown>) => boolean> = [];
  const q = {
    select() {
      return q;
    },
    eq(name: string, value: unknown) {
      filters(table, name, value);
      predicates.push((row) => row[name] === value);
      return q;
    },
    order() {
      return q;
    },
    async limit(n: number) {
      const data = (tables[table] ?? [])
        .filter((row) => predicates.every((fn) => fn(row as Record<string, unknown>)))
        .slice(0, n);
      return { data, error: failTable === table ? { message: "Database unavailable" } : null };
    },
  };
  return q;
});
const call = (companyId = company) =>
  (listFixedAssetPostingAuditTargets as unknown as (args: unknown) => Promise<unknown>)({
    data: { companyId },
    context: { supabase: { from } },
  });
beforeEach(() => {
  vi.resetAllMocks();
  failTable = null;
  tables = Object.fromEntries(Object.entries(initial).map(([name, values]) => [name, [...values]]));
});

describe("bounded Fixed Assets audit target selector", () => {
  it("authorizes accounting viewing, selects company-scoped sources and removes company_id", async () => {
    const result = (await call()) as {
      runs: Array<Record<string, unknown>>;
      disposals: Array<Record<string, unknown>>;
      runsHasMore: boolean;
      disposalsHasMore: boolean;
    };
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      expect.anything(),
      company,
      "accounting.view",
    );
    expect(filters).toHaveBeenCalledWith("fixed_assets", "company_id", company);
    expect(filters).toHaveBeenCalledWith("fixed_assets", "status", "disposed");
    expect(filters).toHaveBeenCalledWith("asset_depreciation_runs", "company_id", company);
    expect(result.runs).toHaveLength(1);
    expect(result.disposals).toHaveLength(1);
    expect(result.runsHasMore).toBe(false);
    expect(result.disposalsHasMore).toBe(false);
    expect(result.runs[0]).not.toHaveProperty("company_id");
    expect(result.disposals[0]).not.toHaveProperty("company_id");
  });

  it("rejects permission denial without exposing source tables", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied"));
    await expect(call()).rejects.toThrow("Denied");
    expect(from).not.toHaveBeenCalled();
  });

  it("validates company UUID before calling server code", () => {
    expect(() => call("not-a-uuid")).toThrow(/Invalid company id/);
    expect(from).not.toHaveBeenCalled();
  });

  it("bounds each list at 100 and reports more results rather than implying exhaustive coverage", async () => {
    tables["asset_depreciation_runs"] = Array.from({ length: 101 }, (_, i) => ({
      ...initial.asset_depreciation_runs[0]!,
      id: "run-" + i,
    }));
    tables["fixed_assets"] = Array.from({ length: 101 }, (_, i) => ({
      ...initial.fixed_assets[0]!,
      id: "asset-" + i,
    }));
    await expect(call()).resolves.toMatchObject({
      runs: expect.arrayContaining([expect.objectContaining({ id: "run-0" })]),
      runsHasMore: true,
      disposalsHasMore: true,
    });
    const result = (await call()) as { runs: unknown[]; disposals: unknown[] };
    expect(result.runs).toHaveLength(100);
    expect(result.disposals).toHaveLength(100);
  });

  it("does not return wrong-company rows from a malformed backend response", async () => {
    tables["asset_depreciation_runs"] = [
      { ...initial.asset_depreciation_runs[0]!, company_id: "another-company" },
    ];
    await expect(call()).resolves.toMatchObject({ runs: [] });
  });

  it("fails on source database errors instead of presenting missing targets as an empty list", async () => {
    failTable = "fixed_assets";
    await expect(call()).rejects.toThrow("Database unavailable");
    failTable = "asset_depreciation_runs";
    await expect(call()).rejects.toThrow("Database unavailable");
  });
});
