import { describe, expect, it } from "vitest";
import { donationAllocations } from "@/lib/nonprofit/donation-entry";

describe("donationAllocations", () => {
  it("keeps a single fund when no second fund is chosen", () => {
    expect(
      donationAllocations({
        amountMinor: 1000,
        primaryFundId: "gen",
        secondaryFundId: "",
        secondaryMinor: 0,
      }),
    ).toEqual([{ fund_id: "gen", amount_minor: 1000 }]);
  });

  it("splits the donation so the two funds equal the total", () => {
    const allocations = donationAllocations({
      amountMinor: 10000,
      primaryFundId: "gen",
      secondaryFundId: "relief",
      secondaryMinor: 4000,
    });
    expect(allocations).toEqual([
      { fund_id: "gen", amount_minor: 6000 },
      { fund_id: "relief", amount_minor: 4000 },
    ]);
    expect(allocations.reduce((sum, row) => sum + row.amount_minor, 0)).toBe(10000);
  });

  it("rejects the same fund twice and a second amount that is not a partial split", () => {
    expect(() =>
      donationAllocations({
        amountMinor: 1000,
        primaryFundId: "gen",
        secondaryFundId: "gen",
        secondaryMinor: 400,
      }),
    ).toThrow(/different funds/);
    expect(() =>
      donationAllocations({
        amountMinor: 1000,
        primaryFundId: "gen",
        secondaryFundId: "relief",
        secondaryMinor: 1000,
      }),
    ).toThrow(/below the donation/);
  });
});
