import { describe, expect, it } from "vitest";
import {
  CONTACT_DIRECTORY_COLUMNS,
  DEFAULT_CONTACT_DIRECTORY_COLUMNS,
  normalizeContactDirectoryColumns,
  selectedContactsOnPage,
  toggleContactDirectoryColumn,
} from "./contact-directory-columns";

describe("contact directory column preferences", () => {
  it("offers the requested city, state and delivery fields", () => {
    const names = CONTACT_DIRECTORY_COLUMNS.map((column) => column.id);
    expect(names).toContain("billing_city");
    expect(names).toContain("billing_region");
    expect(names).toContain("billing_country");
    expect(names).toContain("delivery_city");
    expect(names).toContain("delivery_region");
  });

  it("retains required Contact and removes unknown or duplicate saved fields", () => {
    expect(normalizeContactDirectoryColumns(["billing_city", "bogus", "billing_city", 42])).toEqual(
      ["name", "billing_city"],
    );
    expect(normalizeContactDirectoryColumns(null)).toEqual(DEFAULT_CONTACT_DIRECTORY_COLUMNS);
    expect(normalizeContactDirectoryColumns([])).toEqual(["name"]);
  });

  it("toggles columns without removing Contact", () => {
    const added = toggleContactDirectoryColumn(["name", "email"], "billing_region", true);
    expect(added).toEqual(["name", "email", "billing_region"]);
    expect(toggleContactDirectoryColumn(added, "billing_region", false)).toEqual(["name", "email"]);
    expect(toggleContactDirectoryColumn(added, "name", false)).toEqual(added);
  });

  it("limits any selection to visible contacts and deduplicates IDs", () => {
    expect(selectedContactsOnPage(["a", "a", "c", "b"], ["a", "b"])).toEqual(["a", "b"]);
    expect(selectedContactsOnPage(["a"], ["b"])).toEqual([]);
  });
});
