import type { Sb } from "@/lib/accounting/ledger-data";
import { parseAccountingBasis, type AccountingBasis } from "./accounting-basis";

/** Call after company authorization. The existing accounting setting owns the default. */
export async function resolveReportingBasis(
  supabase: Sb,
  companyId: string,
  override?: AccountingBasis,
): Promise<AccountingBasis> {
  const selected = parseAccountingBasis(override);
  if (selected) return selected;
  const { data, error } = await supabase
    .from("organisation_config" as never)
    .select("document" as never)
    .eq("company_id" as never, companyId as never)
    .eq("category" as never, "accounting" as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const document = (data as { document?: { reporting_basis?: unknown } } | null)?.document;
  return parseAccountingBasis(document?.reporting_basis) ?? "accrual";
}
