import { describe, expect, it } from "vitest";
import {
  CONTACT_DIRECTORY_VIEWS,
  parseContactDirectoryView,
} from "./contact-view-navigation";

describe("Contact directory return navigation", () => {
  it("accepts every supported role and activity view", () => {
    for (const view of CONTACT_DIRECTORY_VIEWS) {
      expect(parseContactDirectoryView(view)).toBe(view);
    }
  });

  it("rejects external URL and path return values", () => {
    expect(parseContactDirectoryView("https://example.com/redirect")).toBeUndefined();
    expect(parseContactDirectoryView("/contacts?view=customers")).toBeUndefined();
    expect(parseContactDirectoryView("../settings")).toBeUndefined();
  });

  it("rejects unsupported query values", () => {
    expect(parseContactDirectoryView("administrator")).toBeUndefined();
    expect(parseContactDirectoryView("Customers")).toBeUndefined();
    expect(parseContactDirectoryView("")).toBeUndefined();
  });

  it("rejects non-string values", () => {
    expect(parseContactDirectoryView(null)).toBeUndefined();
    expect(parseContactDirectoryView(undefined)).toBeUndefined();
    expect(parseContactDirectoryView(["customers"])).toBeUndefined();
    expect(parseContactDirectoryView({ view: "customers" })).toBeUndefined();
  });
});
