import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";

/** A bounded, permissioned selector; not a portfolio-wide audit or asset balance. */
export type FixedAssetAuditTargets = {
  runs: Array<{
    id: string;
    period_end: string;
    asset_count: number;
    journal_id: string | null;
  }>;
  disposals: Array<{
    id: string;
    asset_number: string;
    name: string;
    disposal_date: string | null;
    disposal_journal_id: string | null;
  }>;
  runsHasMore: boolean;
  disposalsHasMore: boolean;
};
export const listFixedAssetPostingAuditTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({
    companyId: assertUuid(input?.companyId),
  }))
  .handler(async ({ data, context }): Promise<FixedAssetAuditTargets> => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const sb = context.supabase;
    const [runResult, assetResult] = await Promise.all([
      sb
        .from("asset_depreciation_runs" as never)
        .select("id, company_id, period_end, asset_count, journal_id" as never)
        .eq("company_id" as never, data.companyId as never)
        .order("period_end" as never, { ascending: false })
        .limit(101),
      sb
        .from("fixed_assets" as never)
        .select("id, company_id, asset_number, name, disposal_date, disposal_journal_id" as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("status" as never, "disposed" as never)
        .order("disposal_date" as never, { ascending: false })
        .limit(101),
    ]);
    if (runResult.error) throw new Error(runResult.error.message);
    if (assetResult.error) throw new Error(assetResult.error.message);
    const rawRuns = (runResult.data ?? []) as unknown as Array<{
      id: string;
      company_id: string;
      period_end: string;
      asset_count: number;
      journal_id: string | null;
    }>;
    const rawDisposals = (assetResult.data ?? []) as unknown as Array<{
      id: string;
      company_id: string;
      asset_number: string;
      name: string;
      disposal_date: string | null;
      disposal_journal_id: string | null;
    }>;
    if (
      rawRuns.length > 101 ||
      rawDisposals.length > 101 ||
      rawRuns.some((x) => x.company_id !== data.companyId) ||
      rawDisposals.some((x) => x.company_id !== data.companyId)
    ) {
      throw new Error("Fixed Asset selector returned invalid or foreign evidence.");
    }
    return {
      runs: rawRuns.slice(0, 100).map(({ id, period_end, asset_count, journal_id }) => ({
        id,
        period_end,
        asset_count,
        journal_id,
      })),
      disposals: rawDisposals
        .slice(0, 100)
        .map(({ id, asset_number, name, disposal_date, disposal_journal_id }) => ({
          id,
          asset_number,
          name,
          disposal_date,
          disposal_journal_id,
        })),
      runsHasMore: rawRuns.length > 100,
      disposalsHasMore: rawDisposals.length > 100,
    };
  });
