import { describe, expect, it } from "vitest";
import {
  CONTACT_DIRECTORY_COLUMNS,
  DEFAULT_HIDDEN_CONTACT_COLUMNS,
  contactDirectoryCellValue,
  type ContactDirectoryRecord,
} from "./contact-directory-columns";

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
    expect(CONTACT_DIRECTORY_COLUMNS.find((item) => item.id === "name")?.required).toBe(true);
    expect(DEFAULT_HIDDEN_CONTACT_COLUMNS).toContain("city");
    expect(DEFAULT_HIDDEN_CONTACT_COLUMNS).toContain("state");
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
