import { describe, expect, it } from "vitest";
import {
  correctionFilter,
  correctionInput,
  correctionSelection,
  decimalFilterToMinor,
  exactMoney,
  grossSelection,
  realDate,
} from "./contracts";
const id = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const item = { id, fingerprint: "a".repeat(32) };
const input = {
  companyId: id,
  items: [item],
  targetId: other,
  mode: "original",
  date: null,
  reason: "Correct nominal coding",
};
describe("transaction correction contracts", () => {
  it("requires actual calendar dates", () => {
    for (const date of ["2026-02-29", "2026-11-31", "01/11/2026", ""])
      expect(realDate.safeParse(date).success).toBe(false);
    expect(realDate.parse("2028-02-29")).toBe("2028-02-29");
  });
  it("rejects empty, duplicate and excessive selections", () => {
    expect(correctionSelection.safeParse([]).success).toBe(false);
    expect(correctionSelection.safeParse([item, item]).success).toBe(false);
    expect(correctionSelection.safeParse(Array(101).fill(item)).success).toBe(false);
  });
  it("does not accept forged line amount fields or missing fingerprints", () => {
    expect(correctionSelection.safeParse([{ ...item, debit_minor: "1" }]).success).toBe(false);
    expect(correctionSelection.safeParse([{ id }]).success).toBe(false);
  });
  it("requires an explicit reason and a valid posting date policy", () => {
    expect(correctionInput.safeParse(input).success).toBe(true);
    expect(correctionInput.safeParse({ ...input, reason: "bad" }).success).toBe(false);
    expect(correctionInput.safeParse({ ...input, date: "2026-11-01" }).success).toBe(false);
    expect(correctionInput.safeParse({ ...input, mode: "adjustment" }).success).toBe(false);
    expect(
      correctionInput.safeParse({ ...input, mode: "adjustment", date: "2026-11-01" }).success,
    ).toBe(true);
  });
  it("rejects reversed date/amount ranges and bounds the search span", () => {
    for (const filters of [
      { from: "2026-11-02", to: "2026-11-01" },
      { from: "2000-01-01", to: "2026-11-01" },
      { from: "2026-11-01", to: "2026-11-02", min_minor: "200", max_minor: "100" },
    ])
      expect(correctionFilter.safeParse(filters).success).toBe(false);
  });
  it("invalid raw minor-unit inputs produce validation failures, not conversion crashes", () => {
    for (const value of ["abc", "1.5", "-1", "9".repeat(100)]) {
      expect(
        correctionFilter.safeParse({
          from: "2026-10-01",
          to: "2026-10-31",
          min_minor: value,
          max_minor: "100",
        }).success,
      ).toBe(false);
    }
  });
  it("converts filters exactly with company currency precision", () => {
    expect(decimalFilterToMinor("100.01", 2)).toBe("10001");
    expect(decimalFilterToMinor("10.125", 3)).toBe("10125");
    expect(decimalFilterToMinor("10", 0)).toBe("10");
    expect(decimalFilterToMinor("", 2)).toBeNull();
  });
  it("never silently rounds a search filter", () => {
    for (const value of ["1.001", "-1", "1e4", "1,000", "NaN"])
      expect(() => decimalFilterToMinor(value, 2)).toThrow();
    expect(() => decimalFilterToMinor("1.0", 0)).toThrow();
  });
  it("keeps money above the JS safe integer limit exact", () => {
    expect(decimalFilterToMinor("90071992547409.93", 2)).toBe("9007199254740993");
    expect(exactMoney("9007199254740993", 2)).toBe("90071992547409.93");
    expect(() => decimalFilterToMinor("9223372036854775808", 0)).toThrow();
  });
  it("supports zero and three decimal currencies without floating point", () => {
    expect(exactMoney("123", 0)).toBe("123");
    expect(exactMoney("-1234", 3)).toBe("-1.234");
    expect(exactMoney("0", 2)).toBe("0.00");
  });
  it("shows gross selection value without cancelling credit notes against debits", () => {
    expect(
      grossSelection([
        { debit_minor: "10000", credit_minor: "0" },
        { debit_minor: "0", credit_minor: "2500" },
      ]),
    ).toBe(12500n);
  });
});
