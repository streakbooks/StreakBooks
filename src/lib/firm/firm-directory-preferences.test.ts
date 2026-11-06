import { describe, expect, it } from "vitest";
import {
  FIRM_DIRECTORY_PREFERENCE_KEYS,
  normalizeFirmDirectoryPreference,
  normalizeFirmSavedViews,
  readFirmDirectoryPreferences,
  replaceFirmSavedView,
  type FirmSavedView,
} from "./firm-directory-preferences";

const base: FirmSavedView = {
  id: "monthly",
  name: "Monthly due",
  query: "payroll",
  status: "active",
  review: "due",
  sort: "review",
};

describe("firm client cloud preferences", () => {
  it("normalizes only allowed columns and keeps an explicit empty selection", () => {
    expect(normalizeFirmDirectoryPreference("columns", ["review", "review", "bogus", "status"]))
      .toEqual(["review", "status"]);
    expect(normalizeFirmDirectoryPreference("columns", [])).toEqual([]);
  });

  it("handles unknown, duplicate and malformed saved view values", () => {
    expect(normalizeFirmSavedViews(null)).toEqual([]);
    expect(normalizeFirmSavedViews([base, { ...base, id: "other" }])).toEqual([base]);
    expect(normalizeFirmSavedViews([
      { id: "unsafe/html", name: "Invalid" },
      { ...base, name: "  Monthly due  " },
    ])).toEqual([base]);
    const normalized = normalizeFirmSavedViews([
      { ...base, id: "two", status: "other", review: "none", sort: "unsafe", query: 42 },
    ]);
    expect(normalized[0]).toEqual({
      ...base,
      id: "two",
      query: "",
      status: "all",
      review: "all",
      sort: "name",
    });
  });

  it("caps views and input lengths", () => {
    const items = Array.from({ length: 35 }, (_, i) => ({
      ...base,
      id: String(i),
      name: "View " + i,
      query: "x".repeat(400),
    }));
    const rows = normalizeFirmSavedViews(items);
    expect(rows).toHaveLength(20);
    expect(rows[0]?.query).toHaveLength(100);
  });

  it("upserts by case-insensitive name without multiplying views", () => {
    const updated = replaceFirmSavedView([base], {
      ...base,
      id: "another",
      name: "MONTHLY DUE",
      sort: "name_desc",
    });
    expect(updated).toHaveLength(1);
    expect(updated[0]?.id).toBe(base.id);
    expect(updated[0]?.sort).toBe("name_desc");
  });

  it("reads each cloud preference key independently", () => {
    const parsed = readFirmDirectoryPreferences([
      { preference_key: FIRM_DIRECTORY_PREFERENCE_KEYS.columns, preference_value: ["email"] },
      { preference_key: FIRM_DIRECTORY_PREFERENCE_KEYS.views, preference_value: [base] },
    ]);
    expect(parsed).toEqual({ columns: ["email"], views: [base] });
    expect(readFirmDirectoryPreferences([])).toEqual({ columns: null, views: null });
  });
});
