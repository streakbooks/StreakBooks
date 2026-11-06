import type { Sb } from "@/lib/accounting/ledger-data";
import { callRpc } from "@/lib/planning/rpc";
import { factsSchema, type ReportingFacts } from "./report-document";
import { loadCashProfitLossInput } from "./cash-profit-loss.server";
import { cashReportingFacts } from "./cash-report-facts";

export async function captureCashReportFacts(
  supabase: Sb,
  companyId: string,
  from: string,
  to: string,
): Promise<ReportingFacts> {
  const base = factsSchema.parse(
    await callRpc(
      supabase,
      "capture_reporting_facts",
      { _company_id: companyId, _from: from, _to: to },
      "The reporting database update is required.",
    ),
  );
  if (base.company.id !== companyId || base.from !== from || base.to !== to)
    throw new Error("Cash capture company or dates do not match the request");
  const input = await loadCashProfitLossInput(
    supabase,
    base,
    to > base.priorTo ? to : base.priorTo,
  );
  return cashReportingFacts(base, input);
}
