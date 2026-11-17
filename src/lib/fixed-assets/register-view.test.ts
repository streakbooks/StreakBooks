import { describe, expect, it } from "vitest";
import type { FixedAssetRow } from "./fixed-assets.functions";
import {
  assetStatusAsOf,
  selectRegisterAssets,
  summariseActiveAssets,
  validAssetAccumulatedAt,
  type AssetRegisterFilters,
} from "./register-view";

function asset(id: string, name: string, changes: Partial<FixedAssetRow> = {}): FixedAssetRow {
  return {
    id,
    asset_type_id: null,
    asset_number: id,
    name,
    description: null,
    notes: null,
    purchase_date: "2026-01-01",
    depreciation_start_date: "2026-01-01",
    cost_minor: 10000,
    residual_minor: 0,
    opening_accumulated_minor: 1000,
    depreciation_method: "straight_line",
    useful_life_months: 60,
    annual_rate_bps: null,
    asset_account_id: "equipment",
    accumulated_account_id: "contra",
    expense_account_id: "expense",
    status: "active",
    depreciated_through: null,
    source_bill_id: null,
    source_bill_line_id: null,
    disposal_date: null,
    disposal_proceeds_minor: null,
    disposal_journal_id: null,
    ...changes,
  };
}

const defaults: AssetRegisterFilters = {
  search: "",
  status: "all",
  typeId: "",
  accountId: "",
  sort: "number",
  descending: false,
};

describe("Fixed asset register view", () => {
  const rows = [
    asset("FA-10", "Laptop", {
      asset_type_id: "computers",
      notes: "Warehouse 4",
      cost_minor: 40000,
    }),
    asset("FA-2", "Van", {
      asset_type_id: "vehicles",
      asset_account_id: "vehicles-gl",
      cost_minor: 70000,
    }),
    asset("FA-3", "Old printer", { status: "disposed", disposal_date: "2026-04-01" }),
  ];
  const types = [
    { id: "computers", name: "Computers" },
    { id: "vehicles", name: "Vehicles" },
  ];
  const accounts = [
    { id: "equipment", code: "1500", name: "Equipment" },
    { id: "vehicles-gl", code: "1510", name: "Vehicles" },
  ];

  it("sorts numeric asset numbers without mutating the register", () => {
    expect(selectRegisterAssets(rows, defaults, types, accounts).map((a) => a.id)).toEqual([
      "FA-2",
      "FA-3",
      "FA-10",
    ]);
    expect(rows.map((a) => a.id)).toEqual(["FA-10", "FA-2", "FA-3"]);
  });

  it("filters by status, type and GL account", () => {
    const selected = selectRegisterAssets(
      rows,
      { ...defaults, status: "active", typeId: "vehicles", accountId: "vehicles-gl" },
      types,
      accounts,
    );
    expect(selected.map((a) => a.name)).toEqual(["Van"]);
    expect(
      selectRegisterAssets(
        rows,
        { ...defaults, status: "disposed", typeId: "vehicles" },
        types,
        accounts,
      ),
    ).toEqual([]);
  });

  it("searches type, account code and notes, ignoring case", () => {
    for (const term of ["COMPUTERS", "1500", "warehouse 4"]) {
      expect(
        selectRegisterAssets(rows, { ...defaults, search: term }, types, accounts).map((a) => a.id),
      ).toContain("FA-10");
    }
    expect(
      selectRegisterAssets(rows, { ...defaults, sort: "cost", descending: true }, types, accounts)
        .map((a) => a.id)
        .slice(0, 2),
    ).toEqual(["FA-2", "FA-10"]);
  });
});

describe("Fixed asset as-at totals", () => {
  const rows = [
    asset("current", "Current", { cost_minor: 10000 }),
    asset("future", "Future", { purchase_date: "2027-01-01", cost_minor: 20000 }),
    asset("disposed", "Disposed", {
      status: "disposed",
      disposal_date: "2026-03-01",
      cost_minor: 30000,
    }),
  ];

  it("excludes future purchases and disposed assets at the cutoff", () => {
    expect(summariseActiveAssets(rows, "2026-11-06", new Map([["current", 4000]]))).toEqual({
      activeCount: 1,
      costMinor: 10000,
      accumulatedMinor: 4000,
      netBookValueMinor: 6000,
    });
  });

  it("refuses to invent closing depreciation if balances are absent", () => {
    expect(summariseActiveAssets(rows, "2026-11-06", null)).toMatchObject({
      activeCount: 1,
      costMinor: 10000,
      accumulatedMinor: null,
      netBookValueMinor: null,
    });
    expect(summariseActiveAssets(rows, "2026-11-06", new Map())).toMatchObject({
      accumulatedMinor: null,
      netBookValueMinor: null,
    });
  });

  it("flags accumulated depreciation that exceeds cost", () => {
    expect(summariseActiveAssets(rows, "2026-11-06", new Map([["current", 10001]]))).toMatchObject({
      costMinor: 10000,
      accumulatedMinor: null,
      netBookValueMinor: null,
    });
  });

  it("refuses as-at accumulated depreciation below the saved opening", () => {
    const current = asset("current", "Current", { opening_accumulated_minor: 2500 });
    expect(validAssetAccumulatedAt(current, 2000)).toBeNull();
    expect(
      summariseActiveAssets([current], "2026-11-06", new Map([["current", 2000]])),
    ).toMatchObject({
      activeCount: 1,
      costMinor: 10000,
      accumulatedMinor: null,
      netBookValueMinor: null,
    });
  });

  it("refuses balances beyond acquisition cost less residual value", () => {
    const current = asset("residual", "Residual", { residual_minor: 5000 });
    expect(validAssetAccumulatedAt(current, 5000)).toBe(5000);
    expect(validAssetAccumulatedAt(current, 5001)).toBeNull();
    expect(
      summariseActiveAssets([current], "2026-11-06", new Map([["residual", 5001]])),
    ).toMatchObject({
      accumulatedMinor: null,
      netBookValueMinor: null,
    });
  });

  it("fails closed when residual plus opening depreciation exceeds acquisition cost", () => {
    const inconsistent = asset("bad", "Inconsistent", {
      cost_minor: 10000,
      residual_minor: 8000,
      opening_accumulated_minor: 3000,
    });
    expect(validAssetAccumulatedAt(inconsistent, 3000)).toBeNull();
    expect(summariseActiveAssets([inconsistent], "2026-11-06", null)).toMatchObject({
      activeCount: 1,
      costMinor: null,
      accumulatedMinor: null,
      netBookValueMinor: null,
    });
  });

  it("refuses individually unsafe or nonpositive costs even where sums could look valid", () => {
    for (const unsafe of [0, -500, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(
        summariseActiveAssets(
          [asset("bad", "Bad cost", { cost_minor: unsafe })],
          "2026-11-06",
          null,
        ).costMinor,
      ).toBeNull();
    }
  });

  it("returns exact as-at balance for fully depreciated assets at residual floor", () => {
    const fully = asset("fully", "Fully depreciated", {
      cost_minor: 10000,
      residual_minor: 2000,
      opening_accumulated_minor: 1000,
    });
    expect(validAssetAccumulatedAt(fully, 8000)).toBe(8000);
    expect(summariseActiveAssets([fully], "2026-11-06", new Map([["fully", 8000]]))).toMatchObject({
      costMinor: 10000,
      accumulatedMinor: 8000,
      netBookValueMinor: 2000,
    });
  });

  it("treats future purchases and disposals by their effective as-at dates", () => {
    expect(
      assetStatusAsOf(asset("future", "Future", { purchase_date: "2027-01-01" }), "2026-11-06"),
    ).toBe("not_acquired");
    const planned = asset("planned", "Planned disposal", {
      status: "disposed",
      disposal_date: "2026-12-01",
    });
    expect(assetStatusAsOf(planned, "2026-11-06")).toBe("active");
    expect(assetStatusAsOf(planned, "2026-12-01")).toBe("disposed");
  });

  it("includes an asset only until its disposal date", () => {
    const futureDisposal = asset("end", "Will be disposed", {
      status: "disposed",
      disposal_date: "2026-12-01",
    });
    expect(
      summariseActiveAssets([futureDisposal], "2026-11-06", new Map([["end", 1200]])).activeCount,
    ).toBe(1);
  });

  it("guards totals that would exceed safe minor-unit precision", () => {
    const large = asset("large", "Large", { cost_minor: Number.MAX_SAFE_INTEGER });
    const another = asset("another", "Another");
    expect(
      summariseActiveAssets(
        [large, another],
        "2026-11-06",
        new Map([
          ["large", 0],
          ["another", 0],
        ]),
      ).costMinor,
    ).toBeNull();
  });
});
