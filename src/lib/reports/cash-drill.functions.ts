import { reportFiltersSchema } from "./report-filters";
import { filterCashEntries } from "./cash-report";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc } from "@/lib/planning/rpc";
import { factsSchema } from "./report-document";
import { isReportDate } from "./date-validation";

export const getCashProfitLossTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        report: z.enum(["profit-and-loss", "balance-sheet"]).default("profit-and-loss"),
        accountId: z.string().uuid(),
        from: z.string().refine(isReportDate),
        to: z.string().refine(isReportDate),
        filters: reportFiltersSchema.default(() => reportFiltersSchema.parse({})),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.from > data.to) throw new Error("End date must follow start date");
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    const facts = factsSchema.parse(
      await callRpc(
        context.supabase,
        "capture_reporting_facts",
        { _company_id: data.companyId, _from: data.from, _to: data.to },
        "The reporting database update is required.",
      ),
    );
    if (facts.company.id !== data.companyId || facts.from !== data.from || facts.to !== data.to)
      throw new Error("Cash drill scope does not match the request");
    const account = facts.accounts.find((row) => row.id === data.accountId);
    if (
      !account ||
      (data.report === "profit-and-loss" && !["income", "expense"].includes(account.account_type))
    )
      throw new Error("Choose an accessible income or expense account");
    const { loadCashProfitLossInput } = await import("./cash-profit-loss.server");
    const { cashProfitLoss } = await import("./cash-profit-loss");
    const input = await loadCashProfitLossInput(context.supabase, facts, data.to);
    const { cashLedger } = await import("./cash-ledger");
    const entries = filterCashEntries(
      data.report === "balance-sheet"
        ? cashLedger(input, { from: "0001-01-01", to: data.to })
        : cashProfitLoss(input, data),
      input,
      data.filters,
    ).filter((entry) => entry.accountId === data.accountId);
    if (entries.length > 2000)
      throw new Error("More than 2,000 cash recognition rows; narrow the reporting period");
    return {
      account: { code: account.code, name: account.name },
      currency: facts.company.baseCurrency,
      rows: entries.map((entry) => ({
        ...entry,
        debit: entry.debit.toString(),
        credit: entry.credit.toString(),
      })),
      debit: entries.reduce((sum, entry) => sum + entry.debit, 0n).toString(),
      credit: entries.reduce((sum, entry) => sum + entry.credit, 0n).toString(),
    };
  });
