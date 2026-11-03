import type { Sb } from "@/lib/accounting/ledger-data";
import { fetchAllPages, type PageResult } from "@/lib/accounting/fetch-all";

/** Every registered depreciation expense account is needed by indirect cash flow. */
export async function loadDepreciationExpenseAccounts(
  supabase: Sb,
  companyId: string,
): Promise<string[]> {
  const rows = await fetchAllPages<{ expense_account_id: string }>(
    (from, to) =>
      supabase
        .from("fixed_assets" as never)
        .select("id, expense_account_id" as never)
        .eq("company_id" as never, companyId as never)
        .order("id" as never)
        .range(from, to) as unknown as PromiseLike<PageResult<{ expense_account_id: string }>>,
  );
  return [...new Set(rows.map((row) => row.expense_account_id))];
}
