import { describe, expect, it } from "vitest";
import {
  fixedAssetReconciliationCsv,
  reconcileFixedAssets,
  type ReconciliationAccount,
  type ReconciliationAsset,
  type ReconciliationDepreciationEntry,
  type ReconciliationLedgerBalance,
} from "./reconciliation";

const accounts: ReconciliationAccount[] = [
  { id: "cost", code: "1500", name: "Equipment cost" },
  { id: "acc", code: "1590", name: "Accumulated depreciation" },
  { id: "mixed", code: "1595", name: "Mixed asset clearing" },
];

const asset = (id: string, changes: Partial<ReconciliationAsset> = {}): ReconciliationAsset => ({
  id,
  asset_account_id: "cost",
  accumulated_account_id: "acc",
  purchase_date: "2026-01-01",
  disposal_date: null,
  status: "active",
  cost_minor: "12000",
  residual_minor: "1000",
  opening_accumulated_minor: "1000",
  ...changes,
});

const depreciation: ReconciliationDepreciationEntry[] = [
  { asset_id: "a", period_end: "2026-01-31", amount_minor: "500" },
  { asset_id: "a", period_end: "2026-03-31", amount_minor: "500" },
];

const balances = (cost: string, accumulated: string): ReconciliationLedgerBalance[] => [
  { account_id: "cost", debit_minor: cost, credit_minor: "0" },
  { account_id: "acc", debit_minor: "0", credit_minor: accumulated },
];

describe("Fixed Assets / GL reconciliation", () => {
  it("matches one held asset to signed posted GL balances", () => {
    const result = reconcileFixedAssets(
      [asset("a")],
      depreciation,
      balances("12000", "2000"),
      accounts,
      "2026-11-06",
    );
    expect(result.varianceCount).toBe(0);
    expect(result.matchedCount).toBe(2);
    expect(result.netDifferenceMinor).toBe("0");
    expect(result.rows.find((row) => row.accountId === "acc")).toMatchObject({
      registerCostMinor: "0",
      registerAccumulatedMinor: "2000",
      registerNetMinor: "-2000",
      ledgerNetMinor: "-2000",
      differenceMinor: "0",
    });
  });

  it("identifies missing GL capitalisation and depreciation, including sign", () => {
    const result = reconcileFixedAssets(
      [asset("a")],
      depreciation,
      balances("10000", "1500"),
      accounts,
      "2026-11-06",
    );
    expect(result.varianceCount).toBe(2);
    expect(result.rows.find((row) => row.accountId === "cost")?.differenceMinor).toBe("-2000");
    expect(result.rows.find((row) => row.accountId === "acc")?.differenceMinor).toBe("500");
    expect(result.netDifferenceMinor).toBe("-1500");
  });

  it("respects an as-at cutoff and does not include future purchases or depreciation", () => {
    const result = reconcileFixedAssets(
      [asset("a"), asset("future", { purchase_date: "2026-12-01" })],
      depreciation,
      balances("12000", "1500"),
      accounts,
      "2026-02-28",
    );
    expect(result.varianceCount).toBe(0);
    expect(result.rows.find((row) => row.accountId === "acc")?.registerAccumulatedMinor).toBe(
      "1500",
    );
  });

  it("expects zero after disposal but retains historic accounts to detect missed clearing", () => {
    const result = reconcileFixedAssets(
      [asset("a", { status: "disposed", disposal_date: "2026-04-30" })],
      depreciation,
      balances("12000", "2000"),
      accounts,
      "2026-11-06",
    );
    expect(result.rows).toHaveLength(2);
    expect(result.varianceCount).toBe(2);
    expect(result.rows.find((row) => row.accountId === "cost")?.registerCostMinor).toBe("0");
  });

  it("treats a future disposal as still active at the prior cutoff", () => {
    const result = reconcileFixedAssets(
      [asset("a", { status: "disposed", disposal_date: "2026-12-01" })],
      depreciation,
      balances("12000", "2000"),
      accounts,
      "2026-11-06",
    );
    expect(result.varianceCount).toBe(0);
  });

  it("supports accounts used as both cost and contra across assets without double-counting GL", () => {
    const result = reconcileFixedAssets(
      [
        asset("a", { accumulated_account_id: "mixed", opening_accumulated_minor: "2000" }),
        asset("b", {
          asset_account_id: "mixed",
          accumulated_account_id: "acc",
          cost_minor: "6000",
          opening_accumulated_minor: "0",
        }),
      ],
      [],
      [
        { account_id: "cost", debit_minor: "12000", credit_minor: "0" },
        { account_id: "mixed", debit_minor: "6000", credit_minor: "2000" },
        { account_id: "acc", debit_minor: "0", credit_minor: "0" },
      ],
      accounts,
      "2026-11-06",
    );
    expect(result.varianceCount).toBe(0);
    expect(result.rows.find((row) => row.accountId === "mixed")).toMatchObject({
      registerNetMinor: "4000",
      ledgerNetMinor: "4000",
      linkedAssets: 2,
    });
  });

  it("uses bigint for summed balances beyond JavaScript safe integer precision", () => {
    const result = reconcileFixedAssets(
      Array.from({ length: 11 }, (_, index) =>
        asset("asset-" + index, {
          cost_minor: "900000000000000",
          opening_accumulated_minor: "0",
        }),
      ),
      [],
      balances("9900000000000000", "0"),
      accounts,
      "2026-11-06",
    );
    expect(result.varianceCount).toBe(0);
    expect(result.rows.find((row) => row.accountId === "cost")?.registerCostMinor).toBe(
      "9900000000000000",
    );
  });

  it("fails closed for imprecise amounts, missing accounts and malformed journals", () => {
    expect(() =>
      reconcileFixedAssets(
        [asset("a", { cost_minor: Number.MAX_SAFE_INTEGER + 1 })],
        [],
        [],
        accounts,
        "2026-11-06",
      ),
    ).toThrow(/precision/i);
    expect(() =>
      reconcileFixedAssets(
        [asset("a", { asset_account_id: "missing" })],
        [],
        [],
        accounts,
        "2026-11-06",
      ),
    ).toThrow(/missing/i);
    expect(() =>
      reconcileFixedAssets(
        [asset("a")],
        [{ asset_id: "a", period_end: "2026-01-31", amount_minor: "-1" }],
        [],
        accounts,
        "2026-11-06",
      ),
    ).toThrow(/positive/i);
  });

  it("flags over-depreciation and depreciation for an unknown asset", () => {
    expect(() =>
      reconcileFixedAssets(
        [
          asset("a", {
            cost_minor: "1000",
            residual_minor: "0",
            opening_accumulated_minor: "800",
          }),
        ],
        [{ asset_id: "a", period_end: "2026-01-31", amount_minor: "201" }],
        balances("1000", "1001"),
        accounts,
        "2026-11-06",
      ),
    ).toThrow(/exceeds/i);
    expect(() =>
      reconcileFixedAssets(
        [asset("a")],
        [{ asset_id: "wrong", period_end: "2026-01-31", amount_minor: "10" }],
        balances("12000", "1000"),
        accounts,
        "2026-11-06",
      ),
    ).toThrow(/unknown asset/i);
  });

  it("fails closed when residual and opening accumulated exceed the asset cost", () => {
    expect(() =>
      reconcileFixedAssets(
        [
          asset("a", {
            cost_minor: "12000",
            residual_minor: "9000",
            opening_accumulated_minor: "4000",
          }),
        ],
        [],
        [],
        accounts,
        "2026-11-06",
      ),
    ).toThrow(/residual or opening/i);
  });

  it("rejects depreciation above depreciable cost, even when below gross cost", () => {
    expect(() =>
      reconcileFixedAssets(
        [
          asset("a", {
            cost_minor: "12000",
            residual_minor: "5000",
            opening_accumulated_minor: "1000",
          }),
        ],
        [{ asset_id: "a", period_end: "2026-03-31", amount_minor: "6001" }],
        balances("12000", "7001"),
        accounts,
        "2026-11-06",
      ),
    ).toThrow(/depreciable cost/i);
  });

  it("allows already posted depreciation for the disposal month (SQL parity)", () => {
    const result = reconcileFixedAssets(
      [asset("a", { status: "disposed", disposal_date: "2026-04-15" })],
      [{ asset_id: "a", period_end: "2026-04-30", amount_minor: "100" }],
      [],
      accounts,
      "2026-11-06",
    );
    expect(result.varianceCount).toBe(0);
    expect(result.rows).toHaveLength(2);
  });

  it("does not silently ignore depreciation posted in a later month after disposal", () => {
    expect(() =>
      reconcileFixedAssets(
        [asset("a", { status: "disposed", disposal_date: "2026-04-15" })],
        [{ asset_id: "a", period_end: "2026-05-31", amount_minor: "100" }],
        [],
        accounts,
        "2026-11-06",
      ),
    ).toThrow(/after the asset disposal month/i);
  });

  it("rejects depreciation recorded before an asset's purchase date", () => {
    expect(() =>
      reconcileFixedAssets(
        [asset("a", { purchase_date: "2026-05-01" })],
        [{ asset_id: "a", period_end: "2026-04-30", amount_minor: "100" }],
        [],
        accounts,
        "2026-11-06",
      ),
    ).toThrow(/precedes the asset purchase/i);
  });

  it("rejects disposed assets without a disposal date or a date before purchase", () => {
    expect(() =>
      reconcileFixedAssets(
        [asset("a", { status: "disposed", disposal_date: null })],
        [],
        [],
        accounts,
        "2026-11-06",
      ),
    ).toThrow(/disposal state/i);
    expect(() =>
      reconcileFixedAssets(
        [asset("a", { status: "disposed", disposal_date: "2025-12-31" })],
        [],
        [],
        accounts,
        "2026-11-06",
      ),
    ).toThrow(/disposal state/i);
    expect(() =>
      reconcileFixedAssets(
        [asset("a", { status: "active", disposal_date: "2026-10-01" })],
        [],
        [],
        accounts,
        "2026-11-06",
      ),
    ).toThrow(/disposal state/i);
  });

  it("fails closed if an asset has duplicate depreciation rows for one month", () => {
    expect(() =>
      reconcileFixedAssets(
        [asset("a")],
        [
          { asset_id: "a", period_end: "2026-03-31", amount_minor: "250" },
          { asset_id: "a", period_end: "2026-03-31", amount_minor: "250" },
        ],
        balances("12000", "1500"),
        accounts,
        "2026-11-06",
      ),
    ).toThrow(/duplicate depreciation entry/i);
  });

  it("rejects historical depreciation beyond cost for assets disposed before the cutoff", () => {
    expect(() =>
      reconcileFixedAssets(
        [
          asset("a", {
            status: "disposed",
            disposal_date: "2026-04-30",
            cost_minor: "12000",
            residual_minor: "2000",
            opening_accumulated_minor: "1000",
          }),
        ],
        [{ asset_id: "a", period_end: "2026-03-31", amount_minor: "9001" }],
        [],
        accounts,
        "2026-11-06",
      ),
    ).toThrow(/depreciable cost/i);
  });

  it("exports exact signed amounts and escapes spreadsheet formulas in account names", () => {
    const result = reconcileFixedAssets(
      [asset("a")],
      depreciation,
      balances("10000", "2000"),
      [
        { id: "cost", code: "1500", name: "=HYPERLINK(1)" },
        { id: "acc", code: "1590", name: "Accumulated depreciation" },
      ],
      "2026-11-06",
    );
    const csv = fixedAssetReconciliationCsv(result);
    expect(csv).toContain("GL account name");
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain("-2000");
    expect(csv).not.toContain('"=HYPERLINK(1)"');
    expect(csv.split("\r\n")).toHaveLength(3);
  });

  it("keeps all source inputs unchanged", () => {
    const a = [asset("a")];
    const e = [...depreciation];
    const g = balances("12000", "2000");
    const before = JSON.stringify({ a, e, g });
    reconcileFixedAssets(a, e, g, accounts, "2026-11-06");
    expect(JSON.stringify({ a, e, g })).toEqual(before);
  });
});
