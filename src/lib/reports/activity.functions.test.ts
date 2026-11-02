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
import { recordReportOpen, getReportActivity } from "./ecosystem.functions";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc } from "@/lib/planning/rpc";
const company = "11111111-1111-4111-8111-111111111111",
  event = "22222222-2222-4222-8222-222222222222",
  account = "33333333-3333-4333-8333-333333333333";
const input = {
  companyId: company,
  eventId: event,
  reportId: "general-ledger",
  from: "2026-10-01",
  to: "2026-10-31",
};
const context = { supabase: {}, userId: "actor" };
const run = (fn: unknown, data: unknown) =>
  (fn as (args: unknown) => Promise<unknown>)({ data, context });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(callRpc).mockResolvedValue(true);
});
describe("report activity API boundaries", () => {
  it("binds actor scope server-side and retains only supported financial report filters", async () => {
    await run(recordReportOpen, {
      ...input,
      search: { account, columns: "month", basis: "cash", sql: "arbitrary executable content" },
    });
    expect(callRpc).toHaveBeenCalledWith(
      context.supabase,
      "record_report_open",
      expect.objectContaining({
        _company_id: company,
        _report_id: "general-ledger",
        _event_id: event,
        _view_id: null,
        _search: { account, columns: "month", basis: "cash" },
      }),
      expect.any(String),
    );
  });
  it.each([recordReportOpen, getReportActivity])(
    "rejects denied reporting permission before calling the database",
    async (fn) => {
      vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Access denied"));
      await expect(run(fn, input)).rejects.toThrow("Access denied");
      expect(callRpc).not.toHaveBeenCalled();
    },
  );
  it.each(["2026-02-30", "not-a-date"])("rejects invalid activity date %s", async (from) => {
    await expect(run(recordReportOpen, { ...input, from })).rejects.toThrow();
    expect(callRpc).not.toHaveBeenCalled();
  });
  it("rejects unknown catalogue IDs before storing activity", async () => {
    await expect(run(recordReportOpen, { ...input, reportId: "unknown-report" })).rejects.toThrow(
      "available financial report",
    );
    expect(callRpc).not.toHaveBeenCalled();
  });
});
