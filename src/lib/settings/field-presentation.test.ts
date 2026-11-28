import { describe, expect, it } from "vitest";
import { CATEGORY_SCHEMAS, defaultDocumentFor, type SettingsCategory } from "./registry";
import { settingsFieldPresentation } from "./field-presentation";

describe("settings field presentation", () => {
  it("supplies readable names and field guidance for every editable setting", () => {
    for (const category of Object.keys(CATEGORY_SCHEMAS) as SettingsCategory[]) {
      for (const field of Object.keys(defaultDocumentFor(category))) {
        const info = settingsFieldPresentation(category, field);
        expect(info.label.length).toBeGreaterThan(5);
        expect(info.description.length).toBeGreaterThan(12);
        expect(info.description).not.toBe("Organisation-level preference.");
      }
    }
  });

  it("makes minor units and threshold semantics explicit", () => {
    const threshold = settingsFieldPresentation("purchases", "approval_threshold_minor");
    expect(threshold.description).toContain("Leave blank");
    expect(threshold.label).toContain("minor units");
  });

  it("explains the specific backend gap for unsupported Sales and Purchases policies", () => {
    expect(settingsFieldPresentation("sales", "late_fees_enabled").partialReason).toContain(
      "calculation and invoice posting are not implemented",
    );
    expect(settingsFieldPresentation("sales", "reminders_enabled").partialReason).toContain(
      "Scheduled reminder delivery is unavailable",
    );
    expect(
      settingsFieldPresentation("purchases", "approval_threshold_minor").partialReason,
    ).toContain("does not consume an amount threshold");
    expect(settingsFieldPresentation("purchases", "duplicate_detection").partialReason).toContain(
      "mandatory for bill integrity",
    );
    expect(
      settingsFieldPresentation("purchases", "contractor_1099_tracking").partialReason,
    ).toContain("not implemented");
  });
});
