import { describe, expect, it } from "vitest";
import {
  countActiveContactFilters,
  DEFAULT_CONTACT_ADVANCED_FILTERS,
  normalizeContactAdvancedFilters,
  normalizeContactSavedViews,
} from "./contact-advanced-filters";

describe("advanced contact filters", () => {
  it("normalizes geographic values and a valid ISO currency", () => {
    expect(
      normalizeContactAdvancedFilters({
        city: "  San Francisco  ",
        region: " CA ",
        country: " United States ",
        currency: "usd",
        terms: "up_to_30",
      }),
    ).toEqual({
      city: "San Francisco",
      region: "CA",
      country: "United States",
      currency: "USD",
      terms: "up_to_30",
    });
  });

  it("uses safe defaults for invalid filters", () => {
    expect(normalizeContactAdvancedFilters(null)).toEqual(DEFAULT_CONTACT_ADVANCED_FILTERS);
    expect(normalizeContactAdvancedFilters({ currency: "dollars", terms: "invalid" })).toEqual(
      DEFAULT_CONTACT_ADVANCED_FILTERS,
    );
  });

  it("counts nonempty filters", () => {
    expect(countActiveContactFilters(normalizeContactAdvancedFilters({}))).toBe(0);
    expect(
      countActiveContactFilters(
        normalizeContactAdvancedFilters({ city: "London", country: "UK", terms: "over_30" }),
      ),
    ).toBe(3);
  });
});

describe("saved contact views", () => {
  it("filters invalid and duplicate saved views and normalizes values", () => {
    const result = normalizeContactSavedViews([
      {
        id: "view-1",
        name: " UK Suppliers ",
        view: "suppliers",
        sort: "name_desc",
        query: "Bob",
        filters: { country: "uk" },
      },
      { id: "view-2", name: "uk suppliers", view: "all" },
      { id: "bad id!", name: "Invalid", view: "all" },
      { id: "view-3", name: "Currency", view: "unexpected", filters: { currency: "gbp" } },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: "view-1",
      name: "UK Suppliers",
      view: "suppliers",
      query: "Bob",
      sort: "name_desc",
      filters: { country: "uk" },
    });
    expect(result[1]).toMatchObject({
      id: "view-3",
      view: "all",
      filters: { currency: "GBP" },
    });
  });

  it("caps presets at 20 and ignores malformed stored values", () => {
    const values = Array.from({ length: 30 }, (_, i) => ({
      id: `view-${i}`,
      name: `View ${i}`,
    }));
    expect(normalizeContactSavedViews(values)).toHaveLength(20);
    expect(normalizeContactSavedViews("not an array")).toEqual([]);
  });
});
