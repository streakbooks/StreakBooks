import type { Sb } from "@/lib/accounting/ledger-data";
import { callRpc } from "@/lib/planning/rpc";
import { factsSchema, type ReportingFacts } from "./report-document";
import { customColumns, type CustomDefinition } from "./custom-definition";
import { loadCashProfitLossInput } from "./cash-profit-loss.server";
import { cashCustomFacts } from "./cash-custom";

export async function captureCashCustom(
  supabase: Sb,
  companyId: string,
  from: string,
  to: string,
  definition: CustomDefinition,
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
    throw new Error("Custom cash capture company or dates do not match the request");
  const lastDate = customColumns(definition, from, to).reduce(
    (last, column) => (column.to > last ? column.to : last),
    to,
  );
  const input = await loadCashProfitLossInput(supabase, base, lastDate);
  return cashCustomFacts(base, input, definition);
}
