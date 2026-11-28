import { expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      middleware: () => chain,
      validator: () => chain,
      handler: (fn: unknown) => fn,
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/assert-company-access", () => ({
  assertCompanyPermission: vi.fn(),
  assertCompanyMember: vi.fn(),
}));
vi.mock("./server-helpers", () => ({ loadBankAccount: vi.fn() }));
import { importBankStatement } from "./import.functions";

it.each([
  { filename: "statement.qif", error: null, reason: "format is unavailable" },
  {
    filename: "statement.csv",
    error: { message: "Configuration unavailable" },
    reason: "Configuration unavailable",
  },
])(
  "stops before writing an import when its format is disabled or settings cannot load",
  async ({ filename, error, reason }) => {
    const query = {
      select: () => query,
      eq: vi.fn(() => query),
      maybeSingle: async () => ({ data: { document: { import_formats: ["csv"] } }, error }),
    };
    const from = vi.fn(() => query);
    const invoke = importBankStatement as unknown as (args: unknown) => Promise<unknown>;
    await expect(
      invoke({
        data: { companyId: "tenant", bankAccountId: "account", filename },
        context: { supabase: { from } },
      }),
    ).rejects.toThrow(reason);
    expect(query.eq.mock.calls).toEqual([
      ["company_id", "tenant"],
      ["category", "banking"],
    ]);
    expect(from.mock.calls).toEqual([["organisation_config"]]);
  },
);
