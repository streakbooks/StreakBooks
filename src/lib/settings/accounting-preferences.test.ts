import { describe, expect, it } from "vitest";
import { hasUnsavedAccountingSettings, prepareAccountingPreferences } from "./accounting-preferences";
import { defaultDocumentFor } from "./registry";
import type { SettingsDocument } from "./settings-centre.functions";

const input = {
  reportingBasis: "cash" as const,
  warnDuplicateNumbers: false,
  warnControlAccounts: true,
  warnBankPosting: true,
  backdatedDays: "45",
  autoApplyCredits: true,
};

describe("legacy accounting preferences save", () => {
  it("preserves account code padding from the canonical configuration", () => {
    const baseline = { ...defaultDocumentFor("accounting"), account_code_padding: 7 };
    const result = prepareAccountingPreferences(baseline, input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document["account_code_padding"]).toBe(7);
      expect(result.document["reporting_basis"]).toBe("cash");
      expect(result.document["warn_backdated_days"]).toBe(45);
    }
  });

  it("rejects blank and malformed backdated-day limits instead of storing zero", () => {
    const baseline = defaultDocumentFor("accounting") as SettingsDocument;
    for (const backdatedDays of ["", "  ", "abc", "-4", "8.5", "5000"]) {
      const result = prepareAccountingPreferences(baseline, { ...input, backdatedDays });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors["warn_backdated_days"]).toBeTruthy();
    }
  });

  it("accepts a deliberate zero-day warning threshold", () => {
    const result = prepareAccountingPreferences(
      defaultDocumentFor("accounting") as SettingsDocument,
      {
        ...input,
        backdatedDays: "0",
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document["warn_backdated_days"]).toBe(0);
  });
});

describe("accounting settings navigation safety", () => {
  it.each([
    [false, false, false],
    [true, false, true],
    [false, true, true],
    [true, true, true],
  ])(
    "protects both independent drafts (lock=%s, preferences=%s)",
    (lockDraftDirty, preferencesDraftDirty, expected) => {
      expect(hasUnsavedAccountingSettings(lockDraftDirty, preferencesDraftDirty)).toBe(expected);
    },
  );
});
