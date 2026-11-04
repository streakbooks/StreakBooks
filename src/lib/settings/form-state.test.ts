import { describe, expect, it } from "vitest";
import {
  areSettingsDocumentsEqual,
  validateSettingsDraft,
} from "./form-state";
import { defaultDocumentFor } from "./registry";
import type { SettingsDocument } from "./settings-centre.functions";

describe("Settings Centre draft validation", () => {
  it("compares documents by values, including array order, not key insertion order", () => {
    expect(
      areSettingsDocumentsEqual(
        { enabled: true, days: [1, 7] },
        { days: [1, 7], enabled: true },
      ),
    ).toBe(true);
    expect(
      areSettingsDocumentsEqual(
        { enabled: true, days: [1, 7] },
        { enabled: true, days: [7, 1] },
      ),
    ).toBe(false);
    expect(areSettingsDocumentsEqual({ value: 0 }, { value: "0" })).toBe(false);
  });

  it("preserves a numeric input as text until save, then normalizes it", () => {
    const defaults = defaultDocumentFor("accounting") as SettingsDocument;
    const result = validateSettingsDraft("accounting", {
      ...defaults,
      warn_backdated_days: "365",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.warn_backdated_days).toBe(365);
  });

  it("rejects blank, invalid and out-of-range numbers instead of silently saving zero", () => {
    const defaults = defaultDocumentFor("accounting") as SettingsDocument;
    for (const raw of ["", " ", "-", "not-a-number", "999999"]) {
      const result = validateSettingsDraft("accounting", {
        ...defaults,
        warn_backdated_days: raw,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.warn_backdated_days).toBeTruthy();
    }
  });

  it("edits optional purchase approval thresholds without coercing blank values to zero", () => {
    const defaults = defaultDocumentFor("purchases") as SettingsDocument;
    const amount = validateSettingsDraft("purchases", {
      ...defaults,
      approval_threshold_minor: "12500",
    });
    expect(amount.ok).toBe(true);
    if (amount.ok) expect(amount.document.approval_threshold_minor).toBe(12500);

    const cleared = validateSettingsDraft("purchases", {
      ...defaults,
      approval_threshold_minor: "",
    });
    expect(cleared.ok).toBe(true);
    if (cleared.ok) expect(cleared.document.approval_threshold_minor).toBeNull();
  });

  it("rejects invalid enum settings and accepts allowed choices", () => {
    const defaults = defaultDocumentFor("reports") as SettingsDocument;
    expect(
      validateSettingsDraft("reports", { ...defaults, default_basis: "something_else" }).ok,
    ).toBe(false);
    expect(
      validateSettingsDraft("reports", { ...defaults, default_basis: "cash" }).ok,
    ).toBe(true);
  });

  it("does not create pretend configuration for categories without an editable schema", () => {
    const result = validateSettingsDraft("tax", {});
    expect(result).toEqual({
      ok: false,
      errors: { _form: "This category has no editable settings." },
    });
  });
});
