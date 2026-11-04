import { describe, expect, it } from "vitest";
import {
  isValidOptionalEmail,
  isValidPositiveFxRate,
  isValidThemeColor,
  validateDocumentSequenceDraft,
} from "./legacy-form-validation";

describe("legacy settings form validation", () => {
  it("accepts valid document numbering without coercing entered values", () => {
    expect(validateDocumentSequenceDraft({ prefix: "INV-", next: "25", padding: "5" })).toEqual({
      ok: true,
      value: { prefix: "INV-", next_number: 25, padding: 5 },
      errors: {},
    });
  });

  it("rejects invalid numbers instead of rendering a misleading fallback preview", () => {
    for (const next of ["", " ", "0", "-3", "1.5", "1e2", "NaN", "9007199254740992"]) {
      expect(validateDocumentSequenceDraft({ prefix: "INV-", next, padding: "4" }).ok).toBe(false);
    }
    for (const padding of ["", "0", "11", "-2", "2.4"]) {
      expect(validateDocumentSequenceDraft({ prefix: "", next: "1", padding }).ok).toBe(false);
    }
    expect(
      validateDocumentSequenceDraft({ prefix: "A".repeat(21), next: "1", padding: "4" }).ok,
    ).toBe(false);
  });

  it("rejects malformed colour, FX and email inputs", () => {
    expect(isValidThemeColor("#0F766E")).toBe(true);
    expect(isValidThemeColor("blue")).toBe(false);
    expect(isValidPositiveFxRate("1.25")).toBe(true);
    for (const rate of ["", "0", "-1", "Infinity", "NaN"]) {
      expect(isValidPositiveFxRate(rate)).toBe(false);
    }
    expect(isValidOptionalEmail("")).toBe(true);
    expect(isValidOptionalEmail("accounts@example.com")).toBe(true);
    expect(isValidOptionalEmail("not-an-email")).toBe(false);
  });
});
