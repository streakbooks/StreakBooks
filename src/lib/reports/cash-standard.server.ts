import type { Sb } from "@/lib/accounting/ledger-data";
import { callRpc } from "@/lib/planning/rpc";
import { factsSchema, type ReportingFacts } from "./report-document";
import { standardPeriods } from "./standard-statement";
import type { StandardSettings } from "./standard-settings";
import { loadCashProfitLossInput } from "./cash-profit-loss.server";
import { cashStandardFacts } from "./cash-standard";

export async function captureCashStandard(
  supabase: Sb,
  companyId: string,
  from: string,
  to: string,
  settings: StandardSettings,
  report: "profit-and-loss" | "balance-sheet" = "profit-and-loss",
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
  const plan = standardPeriods(
    report,
    from,
    to,
    settings,
    base.company.fyEndMonth,
    base.company.fyEndDay ?? 31,
  );
  const last = plan.periods.reduce((max, period) => (period.to > max ? period.to : max), to);
  const input = await loadCashProfitLossInput(supabase, base, last);
  return cashStandardFacts(base, input, settings, report);
}
