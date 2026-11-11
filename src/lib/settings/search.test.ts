import { describe, expect, it } from "vitest";
import { parseSettingsSearch } from "./search";

describe("Settings billing deep-link parsing", () => {
  it("retains valid plan and billing interval", () => {
    expect(parseSettingsSearch({ section: "billing", plan: "pro_annual-2", interval: "year" })).toMatchObject({
      plan: "pro_annual-2", interval: "year",
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
  it("rejects unsupported intervals without dropping valid plan", () => {
    expect(parseSettingsSearch({ plan: "pro", interval: "weekly" })).toMatchObject({ plan: "pro" });
    expect(parseSettingsSearch({ plan: "pro", interval: "weekly" })).not.toHaveProperty("interval");
  });
});
