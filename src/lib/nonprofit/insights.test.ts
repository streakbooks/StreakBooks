import { describe, expect, it } from "vitest";
import { explainFundUtilisation } from "./insights";

describe("nonprofit insights", () => {
  it("quotes only the supplied fund records and returns no autonomous action", () => {
    const insight = explainFundUtilisation([
      {
        fundId: "fund-1",
        fundCode: "RELIEF",
        incomeMinor: 10_000,
        expenseMinor: 4_000,
        availableMinor: 6_000,
        currency: "USD",
      },
    ]);
    expect(insight.evidenceIds).toEqual(["fund-1"]);
    expect(insight.autonomousActions).toEqual([]);
    expect(insight.text).toContain("RELIEF");
    expect(insight.text).toContain("fund-1");
    expect(insight.text.toLowerCase()).toContain("do not post");
  });

  it("does not invent a fund when none was supplied", () => {
    const insight = explainFundUtilisation([]);
    expect(insight.evidenceIds).toEqual([]);
    expect(insight.text).toContain("nothing to explain");
  });
});
