import { describe, expect, it } from "vitest";
import { assertHeaderMatchesLines } from "@/lib/purchases/authorise-totals";

describe("assertHeaderMatchesLines", () => {
  it("accepts matching header and lines", () => {
    expect(() =>
      assertHeaderMatchesLines({
        documentLabel: "Bill",
        subtotalMinor: 1000,
        taxMinor: 200,
        totalMinor: 1200,
        lines: [
          { net_minor: 800, tax_minor: 160 },
          { net_minor: 200, tax_minor: 40 },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects mismatched subtotal or tax", () => {
    expect(() =>
      assertHeaderMatchesLines({
        documentLabel: "Bill",
        subtotalMinor: 999,
        taxMinor: 200,
        totalMinor: 1199,
        lines: [{ net_minor: 1000, tax_minor: 200 }],
      }),
    ).toThrow(/re-save the draft/i);
  });

  it("rejects total that is not subtotal + tax", () => {
    expect(() =>
      assertHeaderMatchesLines({
        documentLabel: "Supplier credit",
        subtotalMinor: 1000,
        taxMinor: 200,
        totalMinor: 1300,
        lines: [{ net_minor: 1000, tax_minor: 200 }],
      }),
    ).toThrow(/subtotal \+ tax/i);
  });

  it("rejects empty lines and non-positive total", () => {
    expect(() =>
      assertHeaderMatchesLines({
        documentLabel: "Bill",
        subtotalMinor: 0,
        taxMinor: 0,
        totalMinor: 0,
        lines: [],
      }),
    ).toThrow(/no lines/i);
    expect(() =>
      assertHeaderMatchesLines({
        documentLabel: "Bill",
        subtotalMinor: 0,
        taxMinor: 0,
        totalMinor: 0,
        lines: [{ net_minor: 0, tax_minor: 0 }],
      }),
    ).toThrow(/greater than zero/i);
  });
});
