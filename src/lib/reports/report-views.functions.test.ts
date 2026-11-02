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
import { assertCompanyPermission } from "@/lib/assert-company-access";
import {
  listReportLibrary,
  updateSavedReportView,
  duplicateSavedReportView,
  deleteSavedReportView,
} from "./report-views.functions";
const calls: Array<[string, ...unknown[]]> = [];
let response: { data: unknown; error: unknown; count?: number };
function sb() {
  return {
    from(table: string) {
      calls.push(["from", table]);
      const query = Object.fromEntries(
        ["select", "eq", "or", "order", "range", "ilike", "insert", "update", "delete", "in"].map(
          (method) => [
            method,
            (...args: unknown[]) => {
              calls.push([method, ...args]);
              return query;
            },
          ],
        ),
      ) as Record<string, (...args: unknown[]) => unknown>;
      query["single"] = () => Promise.resolve(response);
      query["then"] = (resolve: unknown) =>
        Promise.resolve(response).then(resolve as (r: unknown) => unknown);
      return query;
    },
  };
}
const data = {
  companyId: "company-a",
  viewId: "view-a",
  updatedAt: "2026-10-01",
  name: "Monthly",
  config: {},
  isFavourite: false,
  page: 2,
  state: "active",
  sort: "name",
  query: "",
  reportId: "",
  favourite: false,
};
async function run(fn: unknown) {
  return (fn as (args: unknown) => Promise<unknown>)({
    data,
    context: { supabase: sb(), userId: "owner-a" },
  });
}
beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  response = { data: [{ id: "view-a" }], error: null, count: 1 };
});
describe("private report library security", () => {
  it.each([
    listReportLibrary,
    updateSavedReportView,
    duplicateSavedReportView,
    deleteSavedReportView,
  ])("rejects denied reporting permission before touching stored reports", async (fn) => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Access denied"));
    await expect(run(fn)).rejects.toThrow("Access denied");
    expect(calls).toHaveLength(0);
  });
  it("paginates tenant-scoped accessible reports with a stable order; RLS decides owner and grants", async () => {
    await run(listReportLibrary);
    expect(calls).toContainEqual(["eq", "company_id", "company-a"]);
    expect(calls).toContainEqual(["range", 40, 59]);
    expect(calls).toContainEqual(["order", "id", { ascending: true }]);
  });
  it("scopes updates by tenant, id and optimistic version; RLS enforces editable grants", async () => {
    await run(updateSavedReportView);
    for (const pair of [
      ["company_id", "company-a"],
      ["id", "view-a"],
      ["updated_at", "2026-10-01"],
    ])
      expect(calls).toContainEqual(["eq", ...pair]);
  });
  it("reports update conflicts rather than pretending success", async () => {
    response = { data: null, error: { message: "no row" } };
    await expect(run(updateSavedReportView)).rejects.toThrow("Report changed");
  });
  it("does not silently succeed when a delete affects no accessible row", async () => {
    response = { data: null, error: { message: "no row" } };
    await expect(run(deleteSavedReportView)).rejects.toThrow("not deleted");
    expect(calls).toContainEqual(["eq", "user_id", "owner-a"]);
    expect(calls).toContainEqual(["eq", "company_id", "company-a"]);
  });
  it("duplicates only the accessible owner's configuration without financial snapshots", async () => {
    response = {
      data: {
        report_id: "profit-and-loss",
        name: "Review",
        config: { from: "2026-01-01", result: [999999], _library: { archived: true } },
      },
      error: null,
    };
    await run(duplicateSavedReportView);
    expect(calls).toContainEqual([
      "insert",
      {
        company_id: "company-a",
        user_id: "owner-a",
        report_id: "profit-and-loss",
        name: "Review (copy)",
        is_favourite: false,
        config: {
          from: "2026-01-01",
          _library: { archived: false, template: false, description: "" },
        },
      },
    ]);
  });
});
