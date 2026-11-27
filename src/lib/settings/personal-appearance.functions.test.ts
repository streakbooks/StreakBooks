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
import {
  getPersonalAppearancePreferences,
  savePersonalAppearancePreferences,
} from "./personal-appearance.functions";

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
  it("loads only the authenticated user's account-wide row", async () => {
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
      data: Record<string, never>;
      context: { supabase: typeof supabase; userId: string };
    }) => Promise<unknown>;

    await expect(invoke({ data: {}, context: { supabase, userId } })).resolves.toEqual({
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
    expect(supabase.from).toHaveBeenCalledWith("user_global_preferences");
    expect(query.eq).toHaveBeenCalledWith("user_id", userId);
    expect(query.eq).toHaveBeenCalledWith("preference_key", "personal_appearance");
  });

  it("validates input and upserts only the authenticated user’s supported preferences", async () => {
    const query = makeQuery();
    const supabase = { from: vi.fn(() => query) };
    const invoke = savePersonalAppearancePreferences as unknown as (args: {
      data: { theme: unknown; palette: unknown; customPalette?: unknown };
      context: { supabase: typeof supabase; userId: string };
    }) => Promise<unknown>;

    await expect(
      invoke({
        data: {
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
      { onConflict: "user_id,preference_key" },
    );

    expect(() =>
      invoke({
        data: { theme: "dark", palette: "invalid" },
        context: { supabase, userId },
      }),
    ).toThrow("Choose a supported named colour palette");
  });
});
