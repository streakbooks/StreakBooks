import { describe, expect, it } from "vitest";
import { parseReportAccountIds } from "./report-account-selection";
const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";

describe("secure account selection for reports", () => {
  it("uses all accounts only when the filter is omitted", () => {
    expect(parseReportAccountIds(undefined)).toEqual([]);
    expect(parseReportAccountIds("")).toEqual([]);
  });
  it("accepts valid unique accounts and rejects malformed entries", () => {
    expect(parseReportAccountIds(`${first},${second},${first}`)).toEqual([first, second]);
    expect(() => parseReportAccountIds(`${first},invalid`)).toThrow("Invalid");
    expect(() => parseReportAccountIds(",")).toThrow("Invalid");
  });
  it("never falls back to all accounts on an overlong filter", () => {
    expect(() => parseReportAccountIds(first.repeat(104))).toThrow("too long");
    const many = Array.from(
      { length: 101 },
      (_, n) => `11111111-1111-4111-8111-${(n + 1).toString(16).padStart(12, "0")}`,
    );
    expect(() => parseReportAccountIds(many.join(","))).toThrow("too long");
  });
});
