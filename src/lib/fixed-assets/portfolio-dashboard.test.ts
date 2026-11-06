import { describe, expect, it } from "vitest";
import { buildAssetPortfolioSnapshot } from "./portfolio-dashboard";
import type { FixedAssetRow } from "./fixed-assets.functions";

const asset = (
  id: string,
  patch: Partial<FixedAssetRow> = {},
): FixedAssetRow => ({
  id,
  asset_number: "FA-" + id,
  asset_type_id: "computers",
  purchase_date: "2026-01-14",
  depreciation_start_date: "2026-01-14",
  depreciation_method: "straight_line",
  cost_minor: 12000,
  residual_minor: 1000,
  opening_accumulated_minor: 0,
  depreciated_through: "2026-09-30",
  status: "active",
  disposal_date: null,
  ...patch,
} as FixedAssetRow);

const types = [{ id: "computers", name: "Computers" }, { id: "vehicles", name: "Vehicles" }];

describe("fixed assets portfolio dashboard", () => {
  it("shows whole-company active portfolio totals and excludes disposed/future assets", () => {
    const result = buildAssetPortfolioSnapshot(
      [
        asset("active"),
        asset("disposed", { status: "disposed", purchase_date: "2026-11-01", disposal_date: "2026-11-01", cost_minor: 3000 }),
        asset("future", { purchase_date: "2026-11-25" }),
      ],
      types,
      "2026-11-06",
      new Map([["active", 3000]]),
    );
    expect(result).toMatchObject({
      activeCount: 1,
      disposedCount: 1,
      acquiredThisMonth: 1,
      disposedThisMonth: 1,
      possibleDepreciationOverdue: 1,
      costMinor: "12000",
      accumulatedMinor: "3000",
      netBookValueMinor: "9000",
    });
    expect(result.recentAcquisitions.map((a) => a.id)).toEqual(["disposed", "active"]);
  });

  it("never estimates depreciation or book value when as-at balances are missing", () => {
    const result = buildAssetPortfolioSnapshot(
      [asset("a"), asset("b")],
      types,
      "2026-11-06",
      new Map([["a", 3000]]),
    );
    expect(result).toMatchObject({
      activeCount: 2,
      costMinor: "24000",
      accumulatedMinor: null,
      netBookValueMinor: null,
      possibleDepreciationOverdue: null,
    });
  });

  it("does not classify land, fully depreciated assets or current-month starts as overdue", () => {
    const result = buildAssetPortfolioSnapshot(
      [
        asset("land", { depreciation_method: "none" }),
        asset("full", { residual_minor: 2000 }),
        asset("new", { depreciation_start_date: "2026-11-05" }),
      ],
      types,
      "2026-11-06",
      new Map([["land", 0], ["full", 10000], ["new", 0]]),
    );
    expect(result.possibleDepreciationOverdue).toBe(0);
  });

  it("groups active costs by type and keeps shares and totals consistent", () => {
    const result = buildAssetPortfolioSnapshot(
      [
        asset("a", { cost_minor: 3000, asset_type_id: "computers" }),
        asset("b", { cost_minor: 1000, asset_type_id: "vehicles" }),
        asset("c", { cost_minor: 1000, asset_type_id: null }),
      ],
      types,
      "2026-11-06",
      null,
    );
    expect(result.categoryRows.map((g) => [g.name, g.costMinor, g.shareBps])).toEqual([
      ["Computers", "3000", 6000],
      ["Unclassified", "1000", 2000],
      ["Vehicles", "1000", 2000],
    ]);
  });

  it("refuses inconsistent register financial terms rather than showing misleading KPIs", () => {
    expect(() => buildAssetPortfolioSnapshot(
      [asset("invalid-residual", { residual_minor: 15000 })],
      types,
      "2026-11-06",
      new Map([["invalid-residual", 0]]),
    )).toThrow(/residual or opening/i);
    expect(() => buildAssetPortfolioSnapshot(
      [asset("invalid-opening", { opening_accumulated_minor: -10 })],
      types,
      "2026-11-06",
      new Map([["invalid-opening", 0]]),
    )).toThrow(/residual or opening/i);
    expect(() => buildAssetPortfolioSnapshot(
      [asset("imprecise-opening", { opening_accumulated_minor: Number.MAX_SAFE_INTEGER + 1 })],
      types,
      "2026-11-06",
      new Map([["imprecise-opening", 0]]),
    )).toThrow(/residual or opening/i);
  });

  it("uses bigint across safe numeric asset costs to avoid portfolio precision loss", () => {
    const result = buildAssetPortfolioSnapshot(
      [asset("a", { cost_minor: 900_000_000_000_000 }),
       asset("b", { cost_minor: 900_000_000_000_000 })],
      types, "2026-11-06", null,
    );
    expect(result.costMinor).toBe("1800000000000000");
    expect(result.netBookValueMinor).toBeNull();
  });
});
