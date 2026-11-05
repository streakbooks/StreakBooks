import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * The base currency is implicit. Rows in company_currencies represent
 * additional enabled currencies. A missing count is never evidence of zero.
 */
export async function countConfiguredForeignCurrencies(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("company_currencies" as never)
    .select("currency_code" as never, { count: "exact", head: true })
    .eq("company_id" as never, companyId as never);
  if (error) throw new Error(error.message);
  if (count == null) throw new Error("Unable to verify configured foreign currencies");
  return count;
}
