import { describe, expect, it } from "vitest";
import { parseSettingsSearch, searchSettingsFields } from "./search";

describe("Settings billing deep-link parsing", () => {
  it("retains valid plan and billing interval", () => {
    expect(
      parseSettingsSearch({ section: "billing", plan: "pro_annual-2", interval: "year" }),
    ).toMatchObject({
      plan: "pro_annual-2",
      interval: "year",
    });
  });
  it("rejects invalid, oversized and non-string plan values", () => {
    for (const plan of ["../admin", "a".repeat(65), "", ["pro"], 7, "pro plan"]) {
      expect(parseSettingsSearch({ plan })).not.toHaveProperty("plan");
    }
  });
  it("allows a one-character and 64-character plan slug", () => {
    expect(parseSettingsSearch({ plan: "a" }).plan).toBe("a");
    expect(parseSettingsSearch({ plan: "a".repeat(64) }).plan).toBe("a".repeat(64));
  });
  it("retains allowlisted nested settings panel history across refresh", () => {
    expect(
      parseSettingsSearch({
        section: "banking",
        settingsPanel: "bank-rules",
        settingsTrail: ["category:banking"],
      }),
    ).toMatchObject({
      section: "banking",
      settingsPanel: "bank-rules",
      settingsTrail: ["category:banking"],
    });
  });
  it("rejects untrusted panel IDs and invalid nested trails", () => {
    expect(
      parseSettingsSearch({
        settingsPanel: "../../admin",
        settingsTrail: ["category:banking"],
      }),
    ).not.toHaveProperty("settingsPanel");
    expect(
      parseSettingsSearch({
        settingsPanel: "bank-rules",
        settingsTrail: ["../../admin"],
      }),
    ).toMatchObject({ settingsPanel: "bank-rules" });
    expect(
      parseSettingsSearch({
        settingsPanel: "bank-rules",
        settingsTrail: ["../../admin"],
      }),
    ).not.toHaveProperty("settingsTrail");
  });
  it("rejects unsupported intervals without dropping valid plan", () => {
    expect(parseSettingsSearch({ plan: "pro", interval: "weekly" })).toMatchObject({ plan: "pro" });
    expect(parseSettingsSearch({ plan: "pro", interval: "weekly" })).not.toHaveProperty("interval");
  });
  it("preserves only safe in-app module return destinations", () => {
    expect(parseSettingsSearch({ returnTo: "/sales?tab=invoices" }).returnTo).toBe(
      "/sales?tab=invoices",
    );
    for (const returnTo of [
      "https://example.invalid",
      "//example.invalid",
      "/settings",
      "/../auth",
      "/sales/%2e%2e/auth",
      "/auth",
    ]) {
      expect(parseSettingsSearch({ returnTo })).not.toHaveProperty("returnTo");
    }
  });
});

describe("global Settings field search", () => {
  it("finds standalone audited company capabilities and opens their canonical route", () => {
    expect(searchSettingsFields("fiscal year end")).toContainEqual(
      expect.objectContaining({
        key: "company.fiscal_year_end",
        to: "/settings/organisation/overview",
        status: "complete",
      }),
    );
  });

  it("finds legacy document numbering in its canonical settings section", () => {
    expect(searchSettingsFields("document sequences")).toContainEqual(
      expect.objectContaining({
        key: "documents.number_sequences",
        to: "/settings/documents/numbering",
        section: "documents",
      }),
    );
  });

  it("routes Tax capabilities to the owning Tax workspace", () => {
    expect(searchSettingsFields("tax rate and code")).toContainEqual(
      expect.objectContaining({ key: "tax.rate_code_master", to: "/tax", section: null }),
    );
  });
});
