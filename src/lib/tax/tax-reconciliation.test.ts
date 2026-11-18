import { describe, expect, it } from "vitest";
import { returnVariances } from "./tax-reconciliation";

describe("filed tax return comparison", () => {
  it("computes changed minus filed without mutating historic amounts", () => {
    const raw = [
      { box_key: "box1", filed_minor: 5000, now_minor: 4800 },
      { box_key: "box4", filed_minor: 1400, now_minor: 1500 },
    ];
    expect(returnVariances(raw)).toEqual([
      { ...raw[0], deltaMinor: -200n },
      { ...raw[1], deltaMinor: 100n },
    ]);
    expect(raw[0]!.filed_minor).toBe(5000);
    expect(returnVariances([])).toEqual([]);
  });
  it("does not overflow at the maximum safe integer range", () => {
    const [row] = returnVariances([
      {
        box_key: "box5",
        filed_minor: Number.MAX_SAFE_INTEGER,
        now_minor: -Number.MAX_SAFE_INTEGER,
      },
    ]);
    expect(row?.deltaMinor).toBe(-2n * BigInt(Number.MAX_SAFE_INTEGER));
  });
  it("rejects unsafe input instead of rounding reconciled money", () => {
    expect(() =>
      returnVariances([
        {
          box_key: "box5",
          filed_minor: Number.MAX_SAFE_INTEGER + 1,
          now_minor: 0,
        },
      ]),
    ).toThrow(/unsafe/);
  });
});
