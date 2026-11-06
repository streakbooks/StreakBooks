import { describe, expect, it } from "vitest";
import { sumJournalDebits } from "./journal-amounts";

describe("journal list exact amount totals", () => {
  it("sums mixed database number and exact-text minor-unit values", () => {
    expect(sumJournalDebits([{ debit_minor: 123 }, { debit_minor: "45" }])).toBe(168);
    expect(sumJournalDebits([])).toBe(0);
  });

  it("preserves the maximum safe integer without rounding", () => {
    expect(sumJournalDebits([{ debit_minor: "9007199254740990" }, { debit_minor: 1 }]))
      .toBe(Number.MAX_SAFE_INTEGER);
  });

  it("rejects overflow and unsafe JSON numbers instead of silent rounding", () => {
    expect(() => sumJournalDebits([{ debit_minor: "9007199254740992" }])).toThrow("precision");
    expect(() => sumJournalDebits([{ debit_minor: Number.MAX_SAFE_INTEGER + 1 }])).toThrow("unsafe");
    expect(() => sumJournalDebits([
      { debit_minor: Number.MAX_SAFE_INTEGER },
      { debit_minor: 1 },
    ])).toThrow("precision");
  });

  it("rejects negative, fractional, malformed, or missing minor units", () => {
    for (const value of [-1, 1.25, Number.NaN, Infinity, "-2", "1.5", "12abc", ""]) {
      expect(() => sumJournalDebits([{ debit_minor: value }])).toThrow("invalid or unsafe");
    }
  });
});
