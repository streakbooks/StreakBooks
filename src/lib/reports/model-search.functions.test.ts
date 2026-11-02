import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (input: unknown) => unknown = (input) => input;
    const chain = {
      middleware() {
        return chain;
      },
      inputValidator(fn: (input: unknown) => unknown) {
        validate = fn;
        return chain;
      },
      handler(fn: (args: { data: unknown; context: unknown }) => Promise<unknown>) {
        return async (args: { data: unknown; context: unknown }) =>
          fn({ ...args, data: validate(args.data) });
      },
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/assert-company-access", () => ({ assertCompanyPermission: vi.fn() }));
vi.mock("@/lib/planning/rpc", () => ({ callRpc: vi.fn() }));
import {
  searchReportingModels,
  getReportingModel,
  getReportingWorkspace,
} from "./ecosystem.functions";
import { assertCompanyPermission } from "@/lib/assert-company-access";
const companyId = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const query = {
  select: vi.fn(),
  eq: vi.fn(),
  ilike: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
  single: vi.fn(),
  limit: vi.fn(),
};
const from = vi.fn(() => query);
const run = (fn: unknown, data: unknown) =>
  (fn as (args: unknown) => Promise<unknown>)({
    data,
    context: { supabase: { from }, userId: "actor" },
  });
beforeEach(() => {
  vi.resetAllMocks();
  from.mockReturnValue(query);
  for (const method of [query.select, query.eq, query.ilike, query.order])
    method.mockReturnValue(query);
  query.range.mockResolvedValue({ data: [], error: null });
  query.limit.mockResolvedValue({ data: [], error: null });
  query.single.mockResolvedValue({
    data: { id, name: "Current model", kind: "dashboard", config: {}, version: 4 },
    error: null,
  });
});
describe("saved reporting model API", () => {
  it("returns bounded metadata pages with a stable tie-breaker and one-row lookahead", async () => {
    query.range.mockResolvedValueOnce({
      data: Array.from({ length: 51 }, (_, i) => ({
        id: String(i),
        name: "Model",
        kind: "dashboard",
        version: 1,
      })),
      error: null,
    });
    const result = (await run(searchReportingModels, {
      companyId,
      kind: "dashboard",
      page: 20,
    })) as { rows: unknown[]; hasMore: boolean };
    expect(query.select).toHaveBeenCalledWith("id,name,kind,version");
    expect(query.eq).toHaveBeenCalledWith("company_id", companyId);
    expect(query.eq).toHaveBeenCalledWith("kind", "dashboard");
    expect(query.order.mock.calls).toEqual([["name"], ["id"]]);
    expect(query.range).toHaveBeenCalledWith(1000, 1050);
    expect(result.rows).toHaveLength(50);
    expect(result.hasMore).toBe(true);
  });
  it("escapes literal SQL wildcard characters in server search", async () => {
    await run(searchReportingModels, { companyId, kind: "forecast", query: "  100%_plan  " });
    expect(query.ilike).toHaveBeenCalledWith("name", "%100\\%\\_plan%");
  });
  it.each([searchReportingModels, getReportingModel, getReportingWorkspace])(
    "denies unauthorized access before reading any table",
    async (fn) => {
      vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied"));
      await expect(run(fn, { companyId, kind: "dashboard", id })).rejects.toThrow("Denied");
      expect(from).not.toHaveBeenCalled();
    },
  );
  it.each([{ kind: "other" }, { page: -1 }, { pageSize: 1000 }, { query: "x".repeat(161) }])(
    "rejects unsupported or unbounded queries %o",
    async (patch) => {
      await expect(
        run(searchReportingModels, { companyId, kind: "dashboard", ...patch }),
      ).rejects.toThrow();
      expect(from).not.toHaveBeenCalled();
    },
  );
  it("pages schedules and delivery history independently and retains actual totals", async () => {
    query.range.mockResolvedValue({ data: [], count: 1051, error: null });
    const result = JSON.parse(
      (await run(getReportingWorkspace, {
        companyId,
        schedulePage: 20,
        deliveryPage: 4,
      })) as string,
    ) as { scheduleTotal: number; deliveryTotal: number };
    expect(query.range.mock.calls).toEqual([
      [0, 49],
      [1000, 1049],
      [200, 249],
    ]);
    expect(query.order).toHaveBeenCalledWith("next_run_at");
    expect(query.order).toHaveBeenCalledWith("id");
    expect(result.scheduleTotal).toBe(1051);
    expect(result.deliveryTotal).toBe(1051);
  });
  it.each([{ schedulePage: -1 }, { deliveryPage: 1.5 }])(
    "rejects invalid history pages %o",
    async (patch) => {
      await expect(run(getReportingWorkspace, { companyId, ...patch })).rejects.toThrow();
      expect(from).not.toHaveBeenCalled();
    },
  );
  it("loads the selected configuration by company and ID, with its current revision", async () => {
    expect(await run(getReportingModel, { companyId, id })).toMatchObject({ id, version: 4 });
    expect(query.eq.mock.calls).toEqual([
      ["company_id", companyId],
      ["id", id],
    ]);
  });
  it("reports revoked or missing models instead of reusing cached configuration", async () => {
    query.single.mockResolvedValueOnce({ data: null, error: { message: "No row" } });
    await expect(run(getReportingModel, { companyId, id })).rejects.toThrow("unavailable");
  });
});
