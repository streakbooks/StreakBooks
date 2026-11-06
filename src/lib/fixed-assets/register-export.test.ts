import { describe, expect, it } from "vitest";
import type { FixedAssetRow } from "./fixed-assets.functions";
import { buildFixedAssetRegisterCsv } from "./register-export";

const asset = (id: string, changes: Partial<FixedAssetRow> = {}): FixedAssetRow => ({
  id,
  asset_type_id: "computers",
  asset_number: "FA-" + id,
  name: "Laptop " + id,
  description: null,
  notes: null,
  purchase_date: "2026-01-01",
  depreciation_start_date: "2026-01-01",
  cost_minor: 10000,
  residual_minor: 1000,
  opening_accumulated_minor: 1000,
  depreciation_method: "straight_line",
  useful_life_months: 60,
  annual_rate_bps: null,
  asset_account_id: "equipment",
  accumulated_account_id: "contra",
  expense_account_id: "expense",
  status: "active",
  depreciated_through: "2026-10-31",
  source_bill_id: null,
  source_bill_line_id: null,
  disposal_date: null,
  disposal_proceeds_minor: null,
  disposal_journal_id: null,
  ...changes,
});

const types = new Map([["computers", "Computers"]]);
const accounts = new Map([["equipment", "1500 · Computer Equipment"]]);
const toCsv = (assets: readonly FixedAssetRow[], balances: ReadonlyMap<string, number> | null) =>
  buildFixedAssetRegisterCsv(assets, balances, "2026-11-06", types, accounts);

describe("Fixed Assets register CSV export", () => {
  it("exports exact as-at amounts and all standard columns", () => {
    const csv = toCsv([asset("a")], new Map([["a", 4500]]));
    expect(csv.split("\r\n")).toHaveLength(2);
    expect(csv).toContain('"Cost (minor units)"');
    expect(csv).toContain('"Net book value as at 2026-11-06 (minor units)"');
    expect(csv).toContain('"4500","5500"');
    expect(csv).toContain('"1500 · Computer Equipment"');
  });

  it("refuses stale or incomplete balances rather than exporting guessed amounts", () => {
    expect(() => toCsv([asset("a")], null)).toThrow(/unavailable/i);
    expect(() => toCsv([asset("a")], new Map())).toThrow(/exact as-at/i);
  });

  it("refuses accumulated depreciation below opening or above the residual floor", () => {
    expect(() => toCsv([asset("a")], new Map([["a", 999]])))
      .toThrow(/exact as-at/i);
    expect(() => toCsv([asset("a")], new Map([["a", 9001]])))
      .toThrow(/exact as-at/i);
  });

  it("preserves residual NBV for a fully depreciated active asset", () => {
    expect(toCsv([asset("a")], new Map([["a", 9000]])))
      .toContain('"9000","1000"');
  });

  it("reports disposed assets at zero as-at NBV but retains their accumulated history", () => {
    const csv = toCsv(
      [asset("a", { status: "disposed", disposal_date: "2026-04-15" })],
      new Map([["a", 6000]]),
    );
    expect(csv).toContain('"disposed"');
    expect(csv).toContain('"6000","0"');
  });

  it("excludes future acquisition from as-at money amounts", () => {
    const csv = toCsv([asset("a", { purchase_date: "2026-12-01" })], new Map());
    expect(csv).toContain('"Not yet purchased"');
    expect(csv).toContain('"10000","",""');
  });

  it("neutralises formula injection in user-controlled fields, including whitespace and quotes", () => {
    const csv = buildFixedAssetRegisterCsv(
      [asset("a", { asset_number: "=HYPERLINK(1)", name: '   =2+2 "test"' })],
      new Map([["a", 2000]]),
      "2026-11-06",
      new Map([["computers", "+SUM(1,2)"]]),
      new Map([["equipment", "@IMPORTXML(1)"]]),
    );
    expect(csv).toContain('"\'=HYPERLINK(1)"');
    expect(csv).toContain('"\'   =2+2 ""test"""');
    expect(csv).toContain('"\'+SUM(1,2)"');
    expect(csv).toContain('"\'@IMPORTXML(1)"');
  });

  it("refuses duplicate asset rows rather than exporting multiple identical records", () => {
    expect(() => toCsv([asset("a"), asset("a")], new Map([["a", 2000]])))
      .toThrow(/duplicate/i);
  });

  it("does not mutate the source register or balances", () => {
    const rows = [asset("a"), asset("b")];
    const map = new Map([["a", 3000], ["b", 4000]]);
    const before = JSON.stringify({ rows, balances: [...map] });
    toCsv(rows, map);
    expect(JSON.stringify({ rows, balances: [...map] })).toBe(before);
  });

  it("fails when an asset's recorded financial terms contradict its cost", () => {
    expect(() => toCsv(
      [asset("bad", { residual_minor: 9500, opening_accumulated_minor: 1000 })],
      new Map([["bad", 1000]]),
    )).toThrow(/exact as-at/i);
  });

  it("refuses malformed reporting dates", () => {
    expect(() => buildFixedAssetRegisterCsv([asset("a")], new Map([["a", 2000]]),
      "2026-99-06", types, accounts)).toThrow(/valid register/i);
  });
});
