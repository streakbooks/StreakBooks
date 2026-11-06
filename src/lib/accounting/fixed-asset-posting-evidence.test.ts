import { describe, expect, it } from "vitest";
import {
  reviewAssetDepreciationPosting,
  reviewAssetDisposalPosting,
  type AssetPostingAsset,
  type AssetPostingJournal,
  type AssetPostingLine,
  type AssetDepreciationRunEvidence,
  type AssetDepreciationEntryEvidence,
} from "./fixed-asset-posting-evidence";

const company = "company-1";
const journal: AssetPostingJournal = {
  id: "dep-j", company_id: company, journal_date: "2026-10-31",
  status: "posted", currency_code: "GBP", source_type: "depreciation",
  source_id: "run1", idempotency_key: "fa-dep-run:run1", reversed_by_journal_id: null,
};
const run: AssetDepreciationRunEvidence = {
  id: "run1", company_id: company, period_end: "2026-10-31",
  journal_id: "dep-j", total_minor: "80", asset_count: 2,
};
const assets: AssetPostingAsset[] = [
  {
    id: "asset1", company_id: company, cost_minor: "1000",
    opening_accumulated_minor: "200", asset_account_id: "ppe",
    accumulated_account_id: "acc", expense_account_id: "exp",
    status: "active", purchase_date: "2026-01-01", disposal_date: null,
    disposal_proceeds_minor: null, disposal_journal_id: null,
  },
  {
    id: "asset2", company_id: company, cost_minor: "2000",
    opening_accumulated_minor: "300", asset_account_id: "ppe",
    accumulated_account_id: "acc", expense_account_id: "exp",
    status: "active", purchase_date: "2026-01-01", disposal_date: null,
    disposal_proceeds_minor: null, disposal_journal_id: null,
  },
];
const entries: AssetDepreciationEntryEvidence[] = [
  { id: "e1", company_id: company, asset_id: "asset1", run_id: "run1",
    journal_id: "dep-j", period_end: "2026-10-31", amount_minor: "50" },
  { id: "e2", company_id: company, asset_id: "asset2", run_id: "run1",
    journal_id: "dep-j", period_end: "2026-10-31", amount_minor: "30" },
];
const gl: AssetPostingLine[] = [
  { id: "l1", company_id: company, journal_id: "dep-j", line_no: 1,
    account_id: "exp", debit_minor: "80", credit_minor: "0" },
  { id: "l2", company_id: company, journal_id: "dep-j", line_no: 2,
    account_id: "acc", debit_minor: "0", credit_minor: "80" },
];
const audit = (x: {
  run?: AssetDepreciationRunEvidence;
  entries?: AssetDepreciationEntryEvidence[];
  assets?: AssetPostingAsset[];
  journal?: AssetPostingJournal;
  gl?: AssetPostingLine[];
} = {}) => reviewAssetDepreciationPosting(
  company, "GBP", x.run ?? run, x.entries ?? entries,
  x.assets ?? assets, x.journal ?? journal, x.gl ?? gl,
);

const disposed: AssetPostingAsset = {
  ...assets[0]!, status: "disposed", disposal_date: "2026-11-15",
  disposal_proceeds_minor: "600", disposal_journal_id: "disp-j",
};
const disposalJournal: AssetPostingJournal = {
  ...journal, id: "disp-j", journal_date: "2026-11-15", source_type: "asset_disposal",
  source_id: disposed.id, idempotency_key: "fa-dispose:asset1",
};
const depreciationHistory: AssetDepreciationEntryEvidence[] = [
  { ...entries[0]!, id: "historical1", journal_id: "old-dep-j",
    period_end: "2026-09-30", amount_minor: "200" },
  { ...entries[0]!, id: "historical2", journal_id: "dep-j",
    period_end: "2026-10-31", amount_minor: "100" },
];
const disposalGl: AssetPostingLine[] = [
  { id: "d1", company_id: company, journal_id: "disp-j", line_no: 1,
    account_id: "acc", debit_minor: "500", credit_minor: "0" },
  { id: "d2", company_id: company, journal_id: "disp-j", line_no: 2,
    account_id: "bank", debit_minor: "600", credit_minor: "0" },
  { id: "d3", company_id: company, journal_id: "disp-j", line_no: 3,
    account_id: "gain", debit_minor: "0", credit_minor: "100" },
  { id: "d4", company_id: company, journal_id: "disp-j", line_no: 4,
    account_id: "ppe", debit_minor: "0", credit_minor: "1000" },
];
const disposalAudit = (x: {
  asset?: AssetPostingAsset;
  entries?: AssetDepreciationEntryEvidence[];
  journal?: AssetPostingJournal;
  gl?: AssetPostingLine[];
} = {}) => reviewAssetDisposalPosting(
  company, "GBP", x.asset ?? disposed, x.entries ?? depreciationHistory,
  x.journal ?? disposalJournal, x.gl ?? disposalGl,
);

describe("Fixed Assets monthly depreciation source-to-GL evidence", () => {
  it("matches a source run with two assets and a consolidated account-side journal", () => {
    const result = audit();
    expect(result.status).toBe("matched");
    expect(result.expectedTotalMinor).toBe("80");
    expect(result.postedDebitMinor).toBe("80");
    expect(result.registeredTotalMinor).toBe("80");
    expect(result.accountSides).toHaveLength(2);
  });
  it("does not net a debit and a credit when expense and accumulated account overlap", () => {
    const shared = assets.map(a => ({ ...a, expense_account_id: "shared", accumulated_account_id: "shared" }));
    const lines = gl.map(l => ({ ...l, account_id: "shared" }));
    const result = audit({ assets: shared, gl: lines });
    expect(result.status).toBe("matched");
    expect(result.accountSides).toHaveLength(2);
  });
  it("rejects changing source amounts or a posted GL amount", () => {
    expect(audit({ entries: [{ ...entries[0]!, amount_minor: "51" }, entries[1]!] }).status)
      .toBe("exceptions");
    const result = audit({ gl: [{ ...gl[0]!, debit_minor: "79" }, gl[1]!] });
    expect(result.issues.join(" ")).toMatch(/GL difference|GL depreciation total/);
  });
  it("rejects cross-organisation, duplicate and missing depreciation source evidence", () => {
    expect(audit({ run: { ...run, company_id: "other" } }).status).toBe("exceptions");
    expect(audit({ entries: [entries[0]!, { ...entries[0]!, id: "e2" }] }).status)
      .toBe("exceptions");
    expect(audit({ entries: [entries[0]!] }).status).toBe("exceptions");
    expect(audit({ assets: [assets[0]!] }).status).toBe("exceptions");
  });
  it("validates SQL posting source, month end, idempotency, currency and active status", () => {
    expect(audit({ journal: { ...journal, source_id: "other" } }).status).toBe("exceptions");
    expect(audit({ journal: { ...journal, idempotency_key: "wrong" } }).status).toBe("exceptions");
    expect(audit({ journal: { ...journal, currency_code: "USD" } }).status).toBe("exceptions");
    expect(audit({ journal: { ...journal, reversed_by_journal_id: "rev" } }).status).toBe("exceptions");
    expect(audit({ run: { ...run, period_end: "2026-10-30" } }).status).toBe("exceptions");
  });
  it("rejects cross-company, duplicate and invalid-sided journal evidence", () => {
    expect(audit({ gl: [{ ...gl[0]!, company_id: "other" }, gl[1]!] }).status).toBe("exceptions");
    expect(audit({ gl: [gl[0]!, { ...gl[1]!, id: gl[0]!.id }] }).status).toBe("exceptions");
    expect(audit({ gl: [gl[0]!, { ...gl[1]!, line_no: 1 }] }).status).toBe("exceptions");
    expect(audit({ gl: [{ ...gl[0]!, credit_minor: "80" }, gl[1]!] }).status).toBe("exceptions");
  });
  it("rejects an entry that exceeds remaining asset cost", () => {
    const result = audit({
      entries: [{ ...entries[0]!, amount_minor: "801" }, entries[1]!],
    });
    expect(result.issues.join(" ")).toMatch(/asset's valid cost/);
  });
  it("rejects fractional, negative or unsafe numbers without floating-point rounding", () => {
    expect(audit({ entries: [{ ...entries[0]!, amount_minor: "1.3" }, entries[1]!] }).status)
      .toBe("exceptions");
    expect(audit({ gl: [{ ...gl[0]!, debit_minor: Number.MAX_SAFE_INTEGER + 1 }, gl[1]!] }).status)
      .toBe("exceptions");
    expect(audit({ run: { ...run, total_minor: "-80" } }).status).toBe("exceptions");
  });
  it("preserves a total above JS MAX_SAFE_INTEGER from valid individual asset amounts", () => {
    const each = "800000000000000"; // Below SQL per-asset 900000000000000 maximum.
    const huge = (BigInt(each) * 12n).toString();
    const manyAssets = Array.from({ length: 12 }, (_, i) => ({
      ...assets[0]!, id: "large-asset-" + i, opening_accumulated_minor: "0",
      cost_minor: each,
    }));
    const manyEntries = manyAssets.map((asset, i) => ({
      ...entries[0]!, id: "large-entry-" + i, asset_id: asset.id, amount_minor: each,
    }));
    const result = audit({
      run: { ...run, asset_count: manyAssets.length, total_minor: huge },
      entries: manyEntries,
      assets: manyAssets,
      gl: [{ ...gl[0]!, debit_minor: huge }, { ...gl[1]!, credit_minor: huge }],
    });
    expect(result.status).toBe("matched");
    expect(result.expectedTotalMinor).toBe(huge);
  });
});

describe("Fixed Assets disposal source-to-GL evidence", () => {
  it("checks cost and accumulated GL posting but explicitly returns partial classification assurance", () => {
    const result = disposalAudit();
    expect(result.status).toBe("partial");
    expect(result.costMinor).toBe("1000");
    expect(result.accumulatedMinor).toBe("500");
    expect(result.netBookValueMinor).toBe("500");
    expect(result.gainLossMinor).toBe("100");
    expect(result.warnings.join(" ")).toMatch(/not independently verifiable/);
    expect(result.issues).toHaveLength(0);
  });
  it("flags omitted original cost, understated depreciation and unbalanced journals", () => {
    expect(disposalAudit({ gl: disposalGl.filter(l => l.account_id !== "ppe") }).status)
      .toBe("exceptions");
    expect(disposalAudit({ gl: [{ ...disposalGl[0]!, debit_minor: "499" }, ...disposalGl.slice(1)] }).status)
      .toBe("exceptions");
  });
  it("validates source/date/posting key and detects reversed disposal still marked disposed", () => {
    expect(disposalAudit({ journal: { ...disposalJournal, source_id: "wrong" } }).status)
      .toBe("exceptions");
    expect(disposalAudit({ journal: { ...disposalJournal, idempotency_key: "bad" } }).status)
      .toBe("exceptions");
    expect(disposalAudit({ journal: { ...disposalJournal, reversed_by_journal_id: "rev-j" } }).status)
      .toBe("exceptions");
    expect(disposalAudit({ asset: { ...disposed, disposal_journal_id: null } }).status)
      .toBe("exceptions");
  });
  it("rejects depreciation evidence after the disposal month and duplicated source periods", () => {
    expect(disposalAudit({ entries: [{ ...depreciationHistory[0]!, period_end: "2026-12-31" }] }).status)
      .toBe("exceptions");
    expect(disposalAudit({ entries: [
      depreciationHistory[0]!,
      { ...depreciationHistory[1]!, period_end: "2026-09-30" },
    ] }).status).toBe("exceptions");
  });
  it("rejects cumulative depreciation over cost or unsupported negative proceeds", () => {
    expect(disposalAudit({ asset: { ...disposed, cost_minor: "400" } }).status)
      .toBe("exceptions");
    expect(disposalAudit({ asset: { ...disposed, disposal_proceeds_minor: "-1" } }).status)
      .toBe("exceptions");
    expect(disposalAudit({ asset: { ...disposed, disposal_proceeds_minor: null } }).status)
      .toBe("exceptions");
  });
  it("supports zero-proceeds disposal with an identifiable loss, still not a classification all-clear", () => {
    const newAsset = { ...disposed, disposal_proceeds_minor: "0" };
    const zeroProceedsGl = [
      disposalGl[0]!,
      { ...disposalGl[2]!, debit_minor: "500", credit_minor: "0" },
      disposalGl[3]!,
    ];
    const result = disposalAudit({ asset: newAsset, gl: zeroProceedsGl });
    expect(result.status).toBe("partial");
    expect(result.gainLossMinor).toBe("-500");
  });
  it("cannot claim a complete disposal audit just because a balanced journal exists", () => {
    const sameAsDep = { ...disposed, accumulated_account_id: "ppe" };
    const result = disposalAudit({ asset: sameAsDep, gl: disposalGl });
    expect(result.status).toBe("exceptions");
    expect(result.issues.join(" ")).toMatch(/accumulated depreciation/);
  });
});
