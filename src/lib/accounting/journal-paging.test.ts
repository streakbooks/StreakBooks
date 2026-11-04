import { describe, expect, it } from "vitest";
import { journalPageInfo, journalPageRange } from "./journal-paging";

describe("journal server paging", () => {
  it("keeps the old default and computes inclusive database ranges", () => {
    expect(journalPageRange(undefined, undefined)).toEqual({ from: 0, to: 99, limit: 100 });
    expect(journalPageRange(200, 101)).toEqual({ from: 200, to: 300, limit: 101 });
  });

  it("bounds page size and rejects unsafe offsets", () => {
    expect(journalPageRange(0, 999)).toEqual({ from: 0, to: 499, limit: 500 });
    expect(journalPageRange(0, 0)).toEqual({ from: 0, to: 0, limit: 1 });
    for (const offset of [-1, 1.5, Number.NaN, Infinity, 100_001]) {
      expect(() => journalPageRange(offset, 100)).toThrow("Invalid journal page offset");
    }
    expect(() => journalPageRange(0, Number.NaN)).toThrow("Invalid journal page size");
  });

  it("uses a look-ahead row to determine whether the next page exists", () => {
    expect(journalPageInfo(101, 100, 0)).toEqual({ hasNext: true, first: 1, last: 100 });
    expect(journalPageInfo(100, 100, 0)).toEqual({ hasNext: false, first: 1, last: 100 });
    expect(journalPageInfo(14, 100, 2)).toEqual({ hasNext: false, first: 201, last: 214 });
    expect(journalPageInfo(0, 100, 2)).toEqual({ hasNext: false, first: 0, last: 0 });
  });
});
