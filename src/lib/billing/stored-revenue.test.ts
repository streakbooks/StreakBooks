import { describe, expect, it } from "vitest";
import { lifetimeValueMinor, netRevenueMinor } from "./stored-revenue";

describe("stored revenue", () => {
  it("does not treat a missing fee as zero", () => {
    expect(netRevenueMinor(1000, null)).toEqual({ status: "unavailable", minor: null });
  });

  it("subtracts a stored fee from stored gross", () => {
    expect(netRevenueMinor(1000, 30)).toEqual({ status: "stored", minor: 970 });
  });

  it("does not treat missing lifetime value as zero", () => {
    expect(lifetimeValueMinor(null)).toEqual({ status: "unavailable", minor: null });
    expect(lifetimeValueMinor(4500)).toEqual({ status: "stored", minor: 4500 });
  });
});
