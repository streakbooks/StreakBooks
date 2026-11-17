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
vi.mock("@/lib/assert-company-access", () => ({
  assertCompanyPermission: vi.fn(),
  assertCompanyMember: vi.fn(),
}));
vi.mock("@/lib/demo/seed-demo", () => ({ seedDemoCompanyData: vi.fn() }));
vi.mock("@/lib/demo/seed-demo-modules", () => ({ seedDemoModules: vi.fn() }));
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { ensureDemoSeeded, reseedDemoCompany } from "./demo.functions";

const companyId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

const run = (fn: unknown, data: unknown, context: unknown) =>
  (fn as (args: unknown) => Promise<unknown>)({ data, context });

describe("demo company isolation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(assertCompanyPermission).mockResolvedValue(undefined);
    vi.mocked(assertCompanyMember).mockResolvedValue(undefined);
  });

  it("denies reseed when permission is missing", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied"));
    await expect(
      run(reseedDemoCompany, { companyId }, { supabase: { from: vi.fn(), rpc: vi.fn() }, userId }),
    ).rejects.toThrow("Denied");
  });

  it("denies reseed for a non-demo company after permission passes", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { is_demo: false, name: "Live Co" }, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const rpc = vi.fn();
    await expect(
      run(reseedDemoCompany, { companyId }, { supabase: { from, rpc }, userId }),
    ).rejects.toThrow("Reseed denied: only Demo Company can be reseeded");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("denies ensureDemoSeeded for non-demo companies", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { is_demo: false }, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    await expect(
      run(ensureDemoSeeded, { companyId }, { supabase: { from }, userId }),
    ).rejects.toThrow("ensureDemoSeeded is only for Demo Company");
    expect(assertCompanyMember).toHaveBeenCalledWith(expect.anything(), companyId);
  });
});
