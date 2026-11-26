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
  assertCompanyMember: vi.fn(),
  assertCompanyPermission: vi.fn(),
}));
import { assertCompanyMember } from "@/lib/assert-company-access";
import { globalSearch } from "./global-search.functions";

const companyId = "11111111-1111-4111-8111-111111111111";

describe("globalSearch company isolation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(assertCompanyMember).mockResolvedValue(undefined);
  });

  it("denies search when membership check fails", async () => {
    vi.mocked(assertCompanyMember).mockRejectedValueOnce(
      new Error("You do not have access to that organisation."),
    );
    await expect(
      globalSearch({
        data: { companyId, q: "acme" },
        context: { supabase: { from: vi.fn() }, userId: companyId },
      } as never),
    ).rejects.toThrow("You do not have access to that organisation.");
  });

  it("scopes contact search to the requested company_id", async () => {
    const companyEqCalls: unknown[][] = [];
    const result = { data: [], error: null };
    const chain: Record<string, unknown> = {};
    const methods = ["select", "eq", "or", "order", "limit", "ilike", "in"];
    for (const method of methods) {
      chain[method] = vi.fn((...args: unknown[]) => {
        if (method === "eq" && args[0] === "company_id") companyEqCalls.push(args);
        return chain;
      });
    }
    Object.assign(chain, {
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    });
    const from = vi.fn(() => chain);
    await globalSearch({
      data: { companyId, q: "acme", category: "contact", limit: 12 },
      context: { supabase: { from }, userId: companyId },
    } as never);
    expect(assertCompanyMember).toHaveBeenCalledWith(expect.anything(), companyId);
    expect(from).toHaveBeenCalled();
    expect(companyEqCalls.length).toBeGreaterThan(0);
    expect(companyEqCalls.every((args) => args[1] === companyId)).toBe(true);
  });
});
