import { describe, expect, it } from "vitest";
import {
  CONTACT_DIRECTORY_COLUMNS,
  DEFAULT_HIDDEN_CONTACT_COLUMNS,
  contactDirectoryCellValue,
  type ContactDirectoryRecord,
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

const row: ContactDirectoryRecord = {
  id: "one",
  name: "Harbor Retail",
  kind: "both",
  email: "hello@example.com",
  phone: null,
  payment_terms_days: 0,
  account_number: "C010",
  is_active: true,
  billing_city: "San Francisco",
  billing_region: "California",
  billing_postal: "94103",
  billing_country: "US",
  billing_address_line1: "12 Market St",
  legal_name: "Harbor Retail LLC",
  tax_number: "T123",
  website: "https://example.com",
  default_currency: "USD",
};

describe("contact directory configurable columns", () => {
  it("contains unique choices and keeps Name required", () => {
    const ids = CONTACT_DIRECTORY_COLUMNS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CONTACT_DIRECTORY_COLUMNS.find((item) => item.id === "name")).toMatchObject({ required: true });
    expect(DEFAULT_HIDDEN_CONTACT_COLUMNS).toContain("billing_city");
    expect(DEFAULT_HIDDEN_CONTACT_COLUMNS).toContain("billing_region");
    expect(DEFAULT_HIDDEN_CONTACT_COLUMNS).not.toContain("name");
    expect(DEFAULT_HIDDEN_CONTACT_COLUMNS.every((id) => ids.includes(id))).toBe(true);
  });

  it("renders real saved contact geography and keeps zero-day terms", () => {
    expect(contactDirectoryCellValue(row, "city")).toBe("San Francisco");
    expect(contactDirectoryCellValue(row, "state")).toBe("California");
    expect(contactDirectoryCellValue(row, "postal")).toBe("94103");
    expect(contactDirectoryCellValue(row, "country")).toBe("US");
    expect(contactDirectoryCellValue(row, "terms")).toBe("0d");
    expect(contactDirectoryCellValue(row, "roles")).toBe("Customer & supplier");
    expect(contactDirectoryCellValue(row, "status")).toBe("Active");
  });

  it("labels absent values clearly without inventing contact details", () => {
    expect(contactDirectoryCellValue({ ...row, billing_region: null }, "state")).toBe("—");
    expect(contactDirectoryCellValue({ ...row, email: "" }, "email")).toBe("—");
  });
});
