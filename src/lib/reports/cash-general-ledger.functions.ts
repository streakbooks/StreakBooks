import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc } from "@/lib/planning/rpc";
import { factsSchema } from "./report-document";
import { isReportDate } from "./date-validation";
import { parseReportAccountIds } from "./report-account-selection";

/** Read-only cash-basis account transactions. Cash figures come from recognised
 * settlement allocations and balanced cash-ledger entries, not an accrual proxy.
 * Unsupported recognition policies fail closed in the underlying ledger engine.
 */
export const getCashGeneralLedgerAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        from: z.string().refine(isReportDate),
        to: z.string().refine(isReportDate),
        accountIds: z.string().optional(),
        accountScope: z.enum(["transactions", "balance", "all"]).default("balance"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.to < data.from) throw new Error("End date must follow start date");
    const selectedIds = parseReportAccountIds(data.accountIds);
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    const facts = factsSchema.parse(
      await callRpc(
        context.supabase,
        "capture_reporting_facts",
        { _company_id: data.companyId, _from: data.from, _to: data.to },
        "Apply the compatible reporting database migrations before using cash reports.",
      ),
    );
    if (facts.company.id !== data.companyId || facts.from !== data.from || facts.to !== data.to)
      throw new Error("Cash reporting scope does not match the organisation or period");
    if (selectedIds.some((id) => !facts.accounts.some((a) => a.id === id)))
      throw new Error("Report account is not accessible in this organisation");
    const { loadCashProfitLossInput } = await import("./cash-profit-loss.server");
    const { cashLedger } = await import("./cash-ledger");
    const { buildCashGeneralLedger } = await import("./cash-general-ledger");
    const input = await loadCashProfitLossInput(context.supabase, facts, data.to);
    // Full history is necessary for an accurate opening balance.
    const entries = cashLedger(input, { from: "0001-01-01", to: data.to });
    const result = buildCashGeneralLedger({
      accounts: facts.accounts,
      entries,
      from: data.from,
      to: data.to,
      selectedIds,
      accountScope: data.accountScope,
    });
    if (result.lineCount > 2000)
      throw new Error(
        "More than 2,000 cash recognition rows match this report. Narrow the dates or choose fewer accounts to export a complete, accurate result.",
      );
    return result;
  });
