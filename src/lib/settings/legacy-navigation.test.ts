import { describe, expect, it } from "vitest";
import { hasUnsavedLegacySettings } from "./legacy-navigation";

const clean = {
  organisation: false,
  localisation: false,
  branding: false,
  currencies: false,
  sequences: {},
};

describe("legacy Settings Centre draft navigation", () => {
  it("allows navigation with no unsaved settings", () => {
    expect(hasUnsavedLegacySettings(clean)).toBe(false);
    expect(hasUnsavedLegacySettings({ ...clean, sequences: { invoice: false } })).toBe(false);
  });

  it.each(["organisation", "localisation", "branding", "currencies"] as const)(
    "protects unsaved %s changes",
    (field) => {
      expect(hasUnsavedLegacySettings({ ...clean, [field]: true })).toBe(true);
    },
  );

  it("protects any dirty document number sequence", () => {
    expect(
      hasUnsavedLegacySettings({
        ...clean,
        sequences: { invoice: false, bill: true, credit_note: false },
      }),
    ).toBe(true);
  });

  it("allows navigation after all edits are saved or discarded", () => {
    expect(hasUnsavedLegacySettings({ ...clean, sequences: {} })).toBe(false);
  });
});
