import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { loadCompanyMeta, type Sb } from "./ledger-data";
import {
  reviewAssetDepreciationPosting,
  reviewAssetDisposalPosting,
  type AssetDepreciationEntryEvidence,
  type AssetDepreciationPostingReview,
  type AssetDepreciationRunEvidence,
  type AssetDisposalPostingReview,
  type AssetPostingAsset,
  type AssetPostingJournal,
  type AssetPostingLine,
} from "./fixed-asset-posting-evidence";

/**
 * Fixed Assets source-to-GL evidence; no accounting posting, privilege escalation,
 * asset modification or review-state mutation. SQL access remains RLS-enforced.
 *
 * This batch intentionally does not import from the separately open Fixed Assets
 * reconciliation PR. Those register-vs-GL account totals are a different check.
 */
const ASSET_COLUMNS =
  "id, company_id, cost_minor, opening_accumulated_minor, asset_account_id, accumulated_account_id, expense_account_id, status, purchase_date, disposal_date, disposal_proceeds_minor, disposal_journal_id";
const JOURNAL_COLUMNS =
  "id, company_id, journal_date, currency_code, status, source_type, source_id, idempotency_key, reversed_by_journal_id";
const LINE_COLUMNS = "id, company_id, journal_id, line_no, account_id, debit_minor, credit_minor";
const ENTRY_COLUMNS = "id, company_id, asset_id, run_id, period_end, journal_id, amount_minor";

// Use <= 500 so the database default 1000-row REST cap cannot silently
// return an incomplete set. Reaching the sentinel throws, never "passes".
const RUN_ENTRY_LIMIT = 200;
const JOURNAL_LINE_LIMIT = 500;
const DISPOSAL_HISTORY_LIMIT = 500;
const ACCOUNT_LIMIT = 500;

type ServerSb = Parameters<typeof assertCompanyPermission>[0];
type Evidence = { journal: AssetPostingJournal; lines: AssetPostingLine[] };

async function readJournalEvidence(
  sb: ServerSb,
  companyId: string,
  journalId: string,
  requiredAccountIds: readonly string[],
): Promise<Evidence> {
  const { data: rawJournal, error: journalError } = await sb
    .from("journals" as never)
    .select(JOURNAL_COLUMNS as never)
    .eq("company_id" as never, companyId as never)
    .eq("id" as never, journalId as never)
    .maybeSingle();
  if (journalError) throw new Error(journalError.message);
  if (!rawJournal) throw new Error("Fixed Asset posting journal evidence is missing.");
  const journal = rawJournal as unknown as AssetPostingJournal;
  if (journal.id !== journalId || journal.company_id !== companyId) {
    throw new Error("Fixed Asset journal does not match the authorised organisation and posting.");
  }

  const { data: rawLines, error: linesError } = await sb
    .from("journal_lines" as never)
    .select(LINE_COLUMNS as never)
    .eq("company_id" as never, companyId as never)
    .eq("journal_id" as never, journalId as never)
    .order("line_no" as never)
    .limit(JOURNAL_LINE_LIMIT + 1);
  if (linesError) throw new Error(linesError.message);
  const lines = (rawLines ?? []) as unknown as AssetPostingLine[];
  if (lines.length > JOURNAL_LINE_LIMIT) {
    throw new Error("Fixed Asset journal exceeds 500 GL lines; partial evidence is not accepted.");
  }

  // Audit even a posted journal's actual account ownership. Checking only
  // journal_lines.account_id would rely on a potentially stale source mapping.
  const accountIds = [
    ...new Set(
      [...requiredAccountIds, ...lines.map((line) => line.account_id)].filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    ),
  ];
  if (accountIds.length > ACCOUNT_LIMIT) {
    throw new Error("Fixed Asset posting account evidence exceeds the safe review boundary.");
  }
  if (accountIds.length) {
    const { data: rawAccounts, error: accountsError } = await sb
      .from("accounts" as never)
      .select("id, company_id" as never)
      .eq("company_id" as never, companyId as never)
      .in("id" as never, accountIds as never)
      .limit(ACCOUNT_LIMIT + 1);
    if (accountsError) throw new Error(accountsError.message);
    const accounts = (rawAccounts ?? []) as unknown as Array<{
      id: string;
      company_id: string;
    }>;
    if (
      accounts.length !== accountIds.length ||
      new Set(accounts.map((a) => a.id)).size !== accountIds.length ||
      accounts.some(
        (account) => account.company_id !== companyId || !accountIds.includes(account.id),
      )
    ) {
      throw new Error("Fixed Asset posting refers to missing, duplicated or foreign GL accounts.");
    }
  }
  return { journal, lines };
}

/**
 * One selected positive depreciation run. A run with nothing due has no
 * journal and is not treated as missing GL; it is outside this API's scope.
 * Bounded entry/asset/GL evidence prevents a truncated result from matching.
 */
export const auditAssetDepreciationPosting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; runId: string }) => ({
    companyId: assertUuid(input?.companyId),
    runId: assertUuid(input?.runId, "depreciation run"),
  }))
  .handler(async ({ data, context }): Promise<AssetDepreciationPostingReview> => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const sb = context.supabase;

    const { data: rawRun, error: runError } = await sb
      .from("asset_depreciation_runs" as never)
      .select("id, company_id, period_end, journal_id, total_minor, asset_count" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.runId as never)
      .maybeSingle();
    if (runError) throw new Error(runError.message);
    if (!rawRun) throw new Error("Depreciation run not found in this organisation.");
    const run = rawRun as unknown as AssetDepreciationRunEvidence;
    if (run.id !== data.runId || run.company_id !== data.companyId) {
      throw new Error("Depreciation run organisation or identity mismatch.");
    }
    if (!run.journal_id) {
      throw new Error(
        "Selected depreciation run has no linked journal; no posting audit can pass.",
      );
    }
    // One SQL run writes <= 2 GL lines per positive entry; >200 rows must
    // be split into a future paged evidence API, never silently truncated.
    const { data: rawEntries, error: entriesError } = await sb
      .from("asset_depreciation_entries" as never)
      .select(ENTRY_COLUMNS as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("run_id" as never, data.runId as never)
      .order("id" as never)
      .limit(RUN_ENTRY_LIMIT + 1);
    if (entriesError) throw new Error(entriesError.message);
    const entries = (rawEntries ?? []) as unknown as AssetDepreciationEntryEvidence[];
    if (entries.length > RUN_ENTRY_LIMIT) {
      throw new Error("Depreciation run exceeds 200 asset entries; no incomplete audit returned.");
    }

    const assetIds = [...new Set(entries.map((entry) => entry.asset_id).filter(Boolean))];
    let assets: AssetPostingAsset[] = [];
    if (assetIds.length) {
      const { data: rawAssets, error: assetError } = await sb
        .from("fixed_assets" as never)
        .select(ASSET_COLUMNS as never)
        .eq("company_id" as never, data.companyId as never)
        .in("id" as never, assetIds as never)
        .limit(RUN_ENTRY_LIMIT + 1);
      if (assetError) throw new Error(assetError.message);
      assets = (rawAssets ?? []) as unknown as AssetPostingAsset[];
      // Explicitly fail closed on an incomplete or cross-company read.
      if (
        assets.length !== assetIds.length ||
        new Set(assets.map((asset) => asset.id)).size !== assetIds.length ||
        assets.some((asset) => asset.company_id !== data.companyId || !assetIds.includes(asset.id))
      ) {
        throw new Error("Depreciation source assets are missing, duplicated or foreign.");
      }
    }

    const { journal, lines } = await readJournalEvidence(sb, data.companyId, run.journal_id, [
      ...assets.flatMap((asset) => [
        asset.asset_account_id,
        asset.expense_account_id,
        asset.accumulated_account_id,
      ]),
    ]);
    const company = await loadCompanyMeta(sb as unknown as Sb, data.companyId);
    return reviewAssetDepreciationPosting(
      data.companyId,
      company.baseCurrency,
      run,
      entries,
      assets,
      journal,
      lines,
    );
  });

/**
 * One disposed asset's journal against its complete bounded depreciation
 * history. The pure result can only be "partial" or "exceptions" — it cannot
 * certify original proceeds/gain-loss account classification.
 */
export const auditAssetDisposalPosting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; assetId: string }) => ({
    companyId: assertUuid(input?.companyId),
    assetId: assertUuid(input?.assetId, "fixed asset"),
  }))
  .handler(async ({ data, context }): Promise<AssetDisposalPostingReview> => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const sb = context.supabase;
    const { data: rawAsset, error: assetError } = await sb
      .from("fixed_assets" as never)
      .select(ASSET_COLUMNS as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.assetId as never)
      .maybeSingle();
    if (assetError) throw new Error(assetError.message);
    if (!rawAsset) throw new Error("Disposed fixed asset not found in this organisation.");
    const asset = rawAsset as unknown as AssetPostingAsset;
    if (asset.id !== data.assetId || asset.company_id !== data.companyId) {
      throw new Error("Disposal source identity or organisation mismatch.");
    }
    if (!asset.disposal_journal_id) {
      throw new Error(
        "Selected asset has no disposal journal; there is no posting evidence to audit.",
      );
    }

    const { data: rawEntries, error: entryError } = await sb
      .from("asset_depreciation_entries" as never)
      .select(ENTRY_COLUMNS as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("asset_id" as never, data.assetId as never)
      .order("id" as never)
      .limit(DISPOSAL_HISTORY_LIMIT + 1);
    if (entryError) throw new Error(entryError.message);
    const entries = (rawEntries ?? []) as unknown as AssetDepreciationEntryEvidence[];
    if (entries.length > DISPOSAL_HISTORY_LIMIT) {
      throw new Error(
        "Disposal depreciation history exceeds 500 entries; no incomplete audit returned.",
      );
    }

    const { journal, lines } = await readJournalEvidence(
      sb,
      data.companyId,
      asset.disposal_journal_id,
      [asset.asset_account_id, asset.accumulated_account_id],
    );
    const company = await loadCompanyMeta(sb as unknown as Sb, data.companyId);
    return reviewAssetDisposalPosting(
      data.companyId,
      company.baseCurrency,
      asset,
      entries,
      journal,
      lines,
    );
  });
