import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (input: unknown) => unknown = (input) => input;
    const chain = {
      middleware() {
        return chain;
      },
      validator(fn: (input: unknown) => unknown) {
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
vi.mock("@/lib/assert-company-access", () => ({
  assertCompanyPermission: vi.fn(),
  assertCompanyMember: vi.fn(),
}));
vi.mock("@/lib/planning/rpc", () => ({ callRpc: vi.fn() }));
vi.mock("@/lib/sales/sales-common", () => ({ loadCompanyDefaults: vi.fn() }));
import { getAgedReceivablesAsAt } from "@/lib/sales/ar-reports.functions";
import { assertCompanyPermission, assertCompanyMember } from "@/lib/assert-company-access";
import { loadCompanyDefaults } from "@/lib/sales/sales-common";
const from = vi.fn();
const execute = (data: unknown) =>
  (getAgedReceivablesAsAt as unknown as (args: unknown) => Promise<unknown>)({
    data,
    context: { supabase: { from } },
  });
beforeEach(() => {
  vi.resetAllMocks();
});
describe("dated receivables reporting boundary", () => {
  it("requires reporting permission even when company membership is valid", async () => {
    vi.mocked(assertCompanyMember).mockResolvedValue(undefined);
    vi.mocked(assertCompanyPermission).mockRejectedValue(new Error("Reports denied"));
    await expect(
      execute({ companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", asOf: "2026-11-03" }),
    ).rejects.toThrow("Reports denied");
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      expect.anything(),
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "reports.view",
    );
    expect(loadCompanyDefaults).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects nonexistent calendar dates before accessing any company data", async () => {
    await expect(
      execute({ companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", asOf: "2026-02-30" }),
    ).rejects.toThrow("As-at date");
    expect(assertCompanyMember).not.toHaveBeenCalled();
  });
});
