import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (input: unknown) => unknown = (input) => input;
    const chain = {
      middleware() { return chain; },
      inputValidator(fn: (input: unknown) => unknown) { validate = fn; return chain; },
      handler(fn: (args: { data: unknown; context: unknown }) => Promise<unknown>) {
        return (args: { data: unknown; context: unknown }) =>
          fn({ ...args, data: validate(args.data) });
      },
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/assert-company-access", () => ({ assertCompanyPermission: vi.fn() }));
vi.mock("./ledger-data", () => ({ loadCompanyMeta: vi.fn() }));

import { assertCompanyPermission } from "@/lib/assert-company-access";
import { loadCompanyMeta } from "./ledger-data";
import {
  auditAssetDepreciationPosting,
  auditAssetDisposalPosting,
} from "./fixed-asset-posting-evidence.functions";

const company = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const assetId = "33333333-3333-4333-8333-333333333333";
const assetTwo = "44444444-4444-4444-8444-444444444444";
const depreciationJournalId = "55555555-5555-4555-8555-555555555555";
const disposalJournalId = "66666666-6666-4666-8666-666666666666";
const oldDepreciationId = "77777777-7777-4777-8777-777777777777";

const depreciationRun = {
  id: runId, company_id: company, period_end: "2026-10-31",
  journal_id: depreciationJournalId, total_minor: "80", asset_count: 2,
};
const sourceAssets = [
  {
    id: assetId, company_id: company, status: "active", cost_minor: "1000",
    opening_accumulated_minor: "200", asset_account_id: "ppe",
    accumulated_account_id: "acc", expense_account_id: "exp",
    purchase_date: "2026-01-01", disposal_date: null,
    disposal_proceeds_minor: null, disposal_journal_id: null,
  },
  {
    id: assetTwo, company_id: company, status: "active", cost_minor: "2000",
    opening_accumulated_minor: "300", asset_account_id: "ppe",
    accumulated_account_id: "acc", expense_account_id: "exp",
    purchase_date: "2026-01-01", disposal_date: null,
    disposal_proceeds_minor: null, disposal_journal_id: null,
  },
];
const depreciationEntries = [
  { id: "entry1", company_id: company, run_id: runId, asset_id: assetId,
    period_end: "2026-10-31", journal_id: depreciationJournalId, amount_minor: "50" },
  { id: "entry2", company_id: company, run_id: runId, asset_id: assetTwo,
    period_end: "2026-10-31", journal_id: depreciationJournalId, amount_minor: "30" },
];
const depJournal = {
  id: depreciationJournalId, company_id: company, journal_date: "2026-10-31",
  currency_code: "GBP", status: "posted", source_type: "depreciation",
  source_id: runId, idempotency_key: "fa-dep-run:" + runId,
  reversed_by_journal_id: null,
};
const depLines = [
  { id: "line1", company_id: company, journal_id: depreciationJournalId,
    line_no: 1, account_id: "exp", debit_minor: "80", credit_minor: "0" },
  { id: "line2", company_id: company, journal_id: depreciationJournalId,
    line_no: 2, account_id: "acc", debit_minor: "0", credit_minor: "80" },
];
const disposed = {
  ...sourceAssets[0]!, status: "disposed", disposal_date: "2026-11-15",
  disposal_proceeds_minor: "600", disposal_journal_id: disposalJournalId,
};
const disposalJournal = {
  ...depJournal, id: disposalJournalId, journal_date: "2026-11-15",
  source_type: "asset_disposal", source_id: assetId,
  idempotency_key: "fa-dispose:" + assetId,
};
const disposalLines = [
  { id: "d1", company_id: company, journal_id: disposalJournalId,
    line_no: 1, account_id: "acc", debit_minor: "500", credit_minor: "0" },
  { id: "d2", company_id: company, journal_id: disposalJournalId,
    line_no: 2, account_id: "bank", debit_minor: "600", credit_minor: "0" },
  { id: "d3", company_id: company, journal_id: disposalJournalId,
    line_no: 3, account_id: "gain", debit_minor: "0", credit_minor: "100" },
  { id: "d4", company_id: company, journal_id: disposalJournalId,
    line_no: 4, account_id: "ppe", debit_minor: "0", credit_minor: "1000" },
];
const disposalHistory = [
  { id: "history1", company_id: company, run_id: oldDepreciationId,
    asset_id: assetId, period_end: "2026-09-30", journal_id: "old-j",
    amount_minor: "200" },
  { id: "history2", company_id: company, run_id: runId,
    asset_id: assetId, period_end: "2026-10-31",
    journal_id: depreciationJournalId, amount_minor: "100" },
];
const initial = {
  asset_depreciation_runs: [depreciationRun],
  asset_depreciation_entries: [...depreciationEntries],
  fixed_assets: [...sourceAssets],
  journals: [depJournal, disposalJournal],
  journal_lines: [...depLines, ...disposalLines],
  accounts: ["ppe", "acc", "exp", "bank", "gain"].map(id => ({
    id, company_id: company,
  })),
};
let tables: Record<string, unknown[]>;
const seen = vi.fn();
const from = vi.fn((table: string) => {
  const matches: Array<(row: Record<string, unknown>) => boolean> = [];
  const q = {
    select(_fields: string) { return q; },
    eq(field: string, value: unknown) {
      seen(table, field, value);
      matches.push(row => row[field] === value);
      return q;
    },
    in(field: string, ids: string[]) {
      matches.push(row => ids.includes(row[field] as string));
      return q;
    },
    order() { return q; },
    async maybeSingle() {
      const results = (tables[table] ?? [])
        .filter(row => matches.every(match => match(row as Record<string, unknown>)));
      return { data: results[0] ?? null, error: null };
    },
    async limit(amount: number) {
      const results = (tables[table] ?? [])
        .filter(row => matches.every(match => match(row as Record<string, unknown>)));
      return { data: results.slice(0, amount), error: null };
    },
  };
  return q;
});
const callRun = (companyId = company, id = runId) =>
  (auditAssetDepreciationPosting as unknown as (args: unknown) => Promise<unknown>)({
    data: { companyId, runId: id }, context: { supabase: { from } },
  });
const callDisposal = (companyId = company, id = assetId) =>
  (auditAssetDisposalPosting as unknown as (args: unknown) => Promise<unknown>)({
    data: { companyId, assetId: id }, context: { supabase: { from } },
  });
beforeEach(() => {
  vi.resetAllMocks();
  tables = Object.fromEntries(Object.entries(initial).map(([name, values]) => [name, [...values]]));
  vi.mocked(loadCompanyMeta).mockResolvedValue({
    id: company, name: "Test", baseCurrency: "GBP", countryCode: "GB",
    fyEndMonth: 12, fyEndDay: 31, isDemo: true, locale: "en-GB",
  });
});
describe("Fixed Assets posting evidence endpoints: read-only and company-scoped", () => {
  it("authorises and reconciles an exact depreciation run", async () => {
    await expect(callRun()).resolves.toMatchObject({
      status: "matched", expectedTotalMinor: "80", postedDebitMinor: "80",
      postedCreditMinor: "80", entryCount: 2, glLineCount: 2,
    });
    expect(assertCompanyPermission).toHaveBeenCalledWith(expect.anything(), company, "accounting.view");
    for (const table of [
      "asset_depreciation_runs", "asset_depreciation_entries",
      "fixed_assets", "journals", "journal_lines", "accounts",
    ]) expect(seen).toHaveBeenCalledWith(table, "company_id", company);
    expect(from).toHaveBeenCalledTimes(6);
  });
  it("authorises and returns partial disposal verification without false full approval", async () => {
    tables["fixed_assets"] = [disposed];
    tables["asset_depreciation_entries"] = disposalHistory;
    await expect(callDisposal()).resolves.toMatchObject({
      status: "partial", accumulatedMinor: "500", netBookValueMinor: "500",
      gainLossMinor: "100", depreciationEntryCount: 2,
    });
    expect(assertCompanyPermission).toHaveBeenCalledWith(expect.anything(), company, "accounting.view");
    for (const table of [
      "fixed_assets", "asset_depreciation_entries", "journals",
      "journal_lines", "accounts",
    ]) expect(seen).toHaveBeenCalledWith(table, "company_id", company);
  });
  it("rejects invalid company, run and asset IDs before any database call", async () => {
    await expect(callRun("wrong")).rejects.toThrow("Invalid company id");
    await expect(callRun(company, "wrong")).rejects.toThrow(/Invalid depreciation run id/);
    await expect(callDisposal(company, "wrong")).rejects.toThrow(/Invalid fixed asset id/);
    expect(from).not.toHaveBeenCalled();
  });
  it("denies permission before any data query for both audit modes", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Not allowed"));
    await expect(callRun()).rejects.toThrow("Not allowed");
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Not allowed"));
    await expect(callDisposal()).rejects.toThrow("Not allowed");
    expect(from).not.toHaveBeenCalled();
    expect(loadCompanyMeta).not.toHaveBeenCalled();
  });
  it("cannot audit a missing or foreign depreciation run", async () => {
    tables["asset_depreciation_runs"] = [];
    await expect(callRun()).rejects.toThrow(/not found/);
    tables["asset_depreciation_runs"] = [{ ...depreciationRun, company_id: "other" }];
    await expect(callRun()).rejects.toThrow(/not found/);
  });
  it("does not certify a source without its linked posted journal", async () => {
    tables["asset_depreciation_runs"] = [{ ...depreciationRun, journal_id: null }];
    await expect(callRun()).rejects.toThrow(/no linked journal/);
    tables["fixed_assets"] = [{ ...disposed, disposal_journal_id: null }];
    await expect(callDisposal()).rejects.toThrow(/no disposal journal/);
  });
  it("fails closed on more than 200 run entries and never reads a partial journal", async () => {
    tables["asset_depreciation_entries"] = Array.from({ length: 201 }, (_, i) =>
      ({ ...depreciationEntries[0]!, id: "entry-" + i }),
    );
    await expect(callRun()).rejects.toThrow(/exceeds 200 asset entries/);
    expect(seen).not.toHaveBeenCalledWith("journals", "company_id", company);
  });
  it("fails closed on more than 500 disposal historical entries", async () => {
    tables["fixed_assets"] = [disposed];
    tables["asset_depreciation_entries"] = Array.from({ length: 501 }, (_, i) =>
      ({ ...disposalHistory[0]!, id: "history-" + i }),
    );
    await expect(callDisposal()).rejects.toThrow(/exceeds 500 entries/);
  });
  it("rejects truncated, missing or foreign source-asset evidence", async () => {
    tables["fixed_assets"] = [sourceAssets[0]!];
    await expect(callRun()).rejects.toThrow(/source assets are missing/);
    tables["fixed_assets"] = [{ ...sourceAssets[0]!, company_id: "other" }, sourceAssets[1]!];
    await expect(callRun()).rejects.toThrow(/source assets are missing/);
  });
  it("does not return a partial GL audit after more than 500 journal lines", async () => {
    tables["journal_lines"] = Array.from({ length: 501 }, (_, i) =>
      ({ ...depLines[0]!, id: "line-" + i, line_no: i + 1 }),
    );
    await expect(callRun()).rejects.toThrow(/exceeds 500 GL lines/);
  });
  it("rejects missing and foreign GL accounts before source parity review", async () => {
    tables["accounts"] = initial.accounts.filter(x => x.id !== "acc");
    await expect(callRun()).rejects.toThrow(/foreign GL accounts/);
    tables["accounts"] = [{ ...initial.accounts[0]!, company_id: "other" },
      ...initial.accounts.slice(1)];
    await expect(callRun()).rejects.toThrow(/foreign GL accounts/);
  });
  it("returns exceptions for incorrect source journal metadata rather than a match", async () => {
    tables["journals"] = [{ ...depJournal, source_id: "unrelated" }, disposalJournal];
    await expect(callRun()).resolves.toMatchObject({
      status: "exceptions",
      issues: expect.arrayContaining([expect.stringMatching(/journal source type or source ID/)]),
    });
    tables["journals"] = [{ ...depJournal, reversed_by_journal_id: "reversed" },
      disposalJournal];
    await expect(callRun()).resolves.toMatchObject({ status: "exceptions" });
  });
  it("fails closed on a missing journal or missing GL lines", async () => {
    tables["journals"] = [disposalJournal];
    await expect(callRun()).rejects.toThrow(/journal evidence is missing/);
    tables["journals"] = [depJournal, disposalJournal];
    tables["journal_lines"] = disposalLines;
    await expect(callRun()).resolves.toMatchObject({ status: "exceptions" });
  });
});
