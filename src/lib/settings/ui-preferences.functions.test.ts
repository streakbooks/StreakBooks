import { describe, expect, it, vi } from "vitest";

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
        return (args: { data: unknown; context: unknown }) =>
          fn({ ...args, data: validate(args.data) });
      },
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/assert-company-access", () => ({ assertCompanyMember: vi.fn() }));

import { assertCompanyMember } from "@/lib/assert-company-access";
import {
  getBillWorkspacePrefs,
  getBillsListPrefs,
  saveBillWorkspacePrefs,
  saveBillsListPrefs,
} from "./ui-preferences.functions";

const companyId = "10000000-0000-4000-8000-000000000001";
type Result = {
  sidebarState: "open" | "collapsed" | "closed";
  sidebarWidthPx: number;
};

function run(input: {
  userPreference?: { sidebarState: Result["sidebarState"] } | null;
  purchasesDocument?: unknown;
}) {
  const makeQuery = (result: { data: unknown; error: { message: string } | null }) => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn().mockResolvedValue(result),
    };
    return query;
  };
  const userQuery = makeQuery({
    data: input.userPreference ? { preference_value: input.userPreference } : null,
    error: null,
  });
  const configQuery = makeQuery({
    data: input.purchasesDocument === undefined ? null : { document: input.purchasesDocument },
    error: null,
  });
  const from = vi.fn((table: string) =>
    table === "user_ui_preferences" ? userQuery : configQuery,
  );
  const invoke = getBillWorkspacePrefs as unknown as (args: {
    data: { companyId: string };
    context: { supabase: { from: typeof from }; userId: string };
  }) => Promise<Result>;
  return invoke({ data: { companyId }, context: { supabase: { from }, userId: "user-1" } });
}

describe("getBillWorkspacePrefs purchase summary default", () => {
  it.each([
    ["read bill form", getBillWorkspacePrefs],
    ["read bill list", getBillsListPrefs],
    ["save bill form", saveBillWorkspacePrefs],
    ["save bill list", saveBillsListPrefs],
  ])(
    "surfaces an unreadable personal preference during %s and preserves saved data",
    async (_, fn) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: null, error: { message: "Preference unavailable" } }),
        upsert: vi.fn(),
      };
      const invoke = fn as unknown as (args: unknown) => Promise<unknown>;
      await expect(
        invoke({
          data: { companyId, prefs: {} },
          context: { userId: "user-1", supabase: { from: () => query } },
        }),
      ).rejects.toThrow("Preference unavailable");
      expect(query.upsert).not.toHaveBeenCalled();
    },
  );
  it("uses the organisation setting when the user has no saved preference", async () => {
    vi.mocked(assertCompanyMember).mockResolvedValueOnce(undefined);
    const prefs = await run({ purchasesDocument: { show_supplier_summary_default: false } });
    expect(prefs.sidebarState).toBe("closed");
  });

  it("preserves a user’s explicit sidebar preference over the organisation default", async () => {
    vi.mocked(assertCompanyMember).mockResolvedValueOnce(undefined);
    const prefs = await run({
      userPreference: { sidebarState: "open" },
      purchasesDocument: { show_supplier_summary_default: false },
    });
    expect(prefs.sidebarState).toBe("open");
  });

  it("keeps the existing open default when no organisation setting has been saved", async () => {
    vi.mocked(assertCompanyMember).mockResolvedValueOnce(undefined);
    const prefs = await run({});
    expect(prefs.sidebarState).toBe("open");
  });
});
