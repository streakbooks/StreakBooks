import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember } from "@/lib/assert-company-access";
import { fetchAllPages, type PageResult } from "@/lib/accounting/fetch-all";
import {
  fetchLedgerBalances,
  loadAccountMetas,
  loadCompanyMeta,
  type Sb,
} from "@/lib/accounting/ledger-data";
import { todayIso } from "@/lib/accounting/fiscal-year";
import { companyIdOf, isoDate } from "@/lib/planning/rpc";
import {
  reconcileFixedAssets,
  type ReconciliationAsset,
  type ReconciliationDepreciationEntry,
} from "./reconciliation";

/**
 * Read-only, tenant-restricted account reconciliation.
 *
 * Both register and depreciation data are paged by unique ID. The posted-ledger
 * aggregate is the same base-currency data source used by financial reporting.
 * No posting or mutation is performed, and differences require manual review.
 */
export const getFixedAssetReconciliation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; asOf: string }) => {
    const asOf = isoDate(input?.asOf, "Reconciliation date");
    if (asOf > todayIso()) throw new Error("Reconciliation cannot be dated in the future.");
    return { companyId: companyIdOf(input), asOf };
  })
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const sb = context.supabase as unknown as Sb;
    const [company, accounts, assets, depreciationEntries] = await Promise.all([
      loadCompanyMeta(sb, data.companyId),
      loadAccountMetas(sb, data.companyId),
      fetchAllPages<ReconciliationAsset>(
        (from, to) =>
          sb
            .from("fixed_assets" as never)
            .select(
              "id, asset_account_id, accumulated_account_id, purchase_date, disposal_date, status, cost_minor, opening_accumulated_minor" as never,
            )
            .eq("company_id" as never, data.companyId as never)
            .order("id" as never)
            .range(from, to) as unknown as PromiseLike<PageResult<ReconciliationAsset>>,
      ),
      fetchAllPages<ReconciliationDepreciationEntry>(
        (from, to) =>
          sb
            .from("asset_depreciation_entries" as never)
            .select("id, asset_id, period_end, amount_minor" as never)
            .eq("company_id" as never, data.companyId as never)
            .lte("period_end" as never, data.asOf as never)
            .order("id" as never)
            .range(from, to) as unknown as PromiseLike<
              PageResult<ReconciliationDepreciationEntry>
            >,
      ),
    ]);
    const ledgerBalances = await fetchLedgerBalances(sb, data.companyId, company.baseCurrency, {
      to: data.asOf,
    });
    const result = reconcileFixedAssets(
      assets,
      depreciationEntries,
      ledgerBalances,
      accounts.map(({ id, code, name }) => ({ id, code, name })),
      data.asOf,
    );
    return {
      ...result,
      currency: company.baseCurrency,
      registeredAssetCount: assets.filter((asset) => asset.purchase_date <= data.asOf).length,
      scope: "Accounts referenced by the fixed-asset register, including disposed assets" as const,
    };
  });
