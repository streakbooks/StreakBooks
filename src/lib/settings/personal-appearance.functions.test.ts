import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (value: unknown) => unknown = (value) => value;
    const chain = {
      middleware() {
        return chain;
      },
      validator(fn: (value: unknown) => unknown) {
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
  getPersonalAppearancePreferences,
  savePersonalAppearancePreferences,
} from "./personal-appearance.functions";

const companyId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000002";

function makeQuery(
  result: { data?: unknown; error: { message: string } | null } = { error: null },
) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    upsert: vi.fn(async () => result),
  };
  return query;
}

describe("personal appearance server functions", () => {
  it("loads only the authenticated user's row after checking organisation membership", async () => {
    vi.mocked(assertCompanyMember).mockResolvedValue(undefined);
    const query = makeQuery({
      data: {
        preference_value: {
          theme: "dark",
          palette: "custom",
          customPalette: {
            primary: "#112233",
            accent: "#445566",
            sidebar: "#778899",
            lightBackground: "#aabbcc",
            darkBackground: "#010203",
          },
        },
      },
      error: null,
    });
    const supabase = { from: vi.fn(() => query) };
    const invoke = getPersonalAppearancePreferences as unknown as (args: {
      data: { companyId: string };
      context: { supabase: typeof supabase; userId: string };
    }) => Promise<unknown>;

    await expect(invoke({ data: { companyId }, context: { supabase, userId } })).resolves.toEqual({
      theme: "dark",
      palette: "custom",
      customPalette: {
        primary: "#112233",
        accent: "#445566",
        sidebar: "#778899",
        lightBackground: "#aabbcc",
        darkBackground: "#010203",
      },
    });
    expect(assertCompanyMember).toHaveBeenCalledWith(supabase, companyId);
    expect(query.eq).toHaveBeenCalledWith("company_id", companyId);
    expect(query.eq).toHaveBeenCalledWith("user_id", userId);
    expect(query.eq).toHaveBeenCalledWith("preference_key", "personal_appearance");
  });

  it("validates input and upserts only the authenticated user’s supported preferences", async () => {
    vi.mocked(assertCompanyMember).mockResolvedValue(undefined);
    const query = makeQuery();
    const supabase = { from: vi.fn(() => query) };
    const invoke = savePersonalAppearancePreferences as unknown as (args: {
      data: { companyId: string; theme: unknown; palette: unknown; customPalette?: unknown };
      context: { supabase: typeof supabase; userId: string };
    }) => Promise<unknown>;

    await expect(
      invoke({
        data: {
          companyId,
          theme: "dark",
          palette: "custom",
          customPalette: {
            primary: "#112233",
            accent: "#445566",
            sidebar: "#778899",
            lightBackground: "#aabbcc",
            darkBackground: "#010203",
          },
        },
        context: { supabase, userId },
      }),
    ).resolves.toEqual({
      theme: "dark",
      palette: "custom",
      customPalette: {
        primary: "#112233",
        accent: "#445566",
        sidebar: "#778899",
        lightBackground: "#aabbcc",
        darkBackground: "#010203",
      },
    });
    expect(query.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: companyId,
        user_id: userId,
        preference_key: "personal_appearance",
        preference_value: {
          theme: "dark",
          palette: "custom",
          customPalette: {
            primary: "#112233",
            accent: "#445566",
            sidebar: "#778899",
            lightBackground: "#aabbcc",
            darkBackground: "#010203",
          },
        },
      }),
      { onConflict: "company_id,user_id,preference_key" },
    );

    expect(() =>
      invoke({
        data: { companyId, theme: "dark", palette: "invalid" },
        context: { supabase, userId },
      }),
    ).toThrow("Choose a supported named colour palette");
  });
});
