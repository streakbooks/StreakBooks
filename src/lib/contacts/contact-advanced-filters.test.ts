import { describe, expect, it } from "vitest";
import {
  countActiveContactFilters,
  DEFAULT_CONTACT_ADVANCED_FILTERS,
  normalizeContactAdvancedFilters,
  normalizeContactSavedViews,
  contactDirectoryMembershipSelect,
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
      groupId: "",
      tagId: "",
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
    const groupId = "01234567-89ab-cdef-0123-456789abcdef";
    const tagId = "fedcba98-7654-3210-fedc-ba9876543210";
    const filters = normalizeContactAdvancedFilters({ groupId, tagId, city: "London" });
    expect(filters.groupId).toBe(groupId);
    expect(filters.tagId).toBe(tagId);
    expect(countActiveContactFilters(filters)).toBe(3);
    expect(contactDirectoryMembershipSelect("id,name", filters)).toBe(
      "id,name,contact_group_members!inner(group_id),contact_tag_assignments!inner(tag_id)",
    );
    expect(contactDirectoryMembershipSelect("id", normalizeContactAdvancedFilters({}))).toBe("id");
    expect(
      normalizeContactAdvancedFilters({ groupId: "bad", tagId: "x".repeat(200) }),
    ).toMatchObject({
      groupId: "",
      tagId: "",
    });
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
        filters: { country: "uk", groupId: "", tagId: "" },
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

  it("restores a saved membership segment without trusting malformed IDs", () => {
    const groupId = "01234567-89ab-cdef-0123-456789abcdef";
    const views = normalizeContactSavedViews([
      {
        id: "group-segment",
        name: "VIP",
        filters: { groupId, tagId: "malicious" },
      },
    ]);
    expect(views[0]?.filters).toMatchObject({ groupId, tagId: "" });
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
