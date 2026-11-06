import { loadCompanyMeta, loadAccountMetas, type Sb } from "@/lib/accounting/ledger-data";
import { loadCashProfitLossInput } from "./cash-profit-loss.server";
import { cashLedger } from "./cash-ledger";
import { cashEntriesToPostedLines } from "./cash-report";

/** Reuses the authoritative posted journals and allocation history; never posts cash journals. */
export async function loadCashReportInput(supabase: Sb, companyId: string, to: string) {
  const [company, accounts] = await Promise.all([
    loadCompanyMeta(supabase, companyId),
    loadAccountMetas(supabase, companyId),
  ]);
  const facts = { company: { ...company, fyEndDay: company.fyEndDay }, accounts };
  return loadCashProfitLossInput(supabase, facts, to);
}

export async function loadCashReportLines(
  supabase: Sb,
  companyId: string,
  from: string,
  to: string,
) {
  const input = await loadCashReportInput(supabase, companyId, to);
  return cashEntriesToPostedLines(input, cashLedger(input, { from, to }));
}
