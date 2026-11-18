import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { loadCompanyMeta, loadPostedLines, type Sb } from "./ledger-data";
import {
  calculatePayrollLiabilityRollforward,
  type LiabilitySourceRun,
  type LiabilitySourcePayment,
  type LiabilityRollforwardResult,
} from "./payroll-liability-rollforward";

/** Read-only period roll-forward, from the existing paged base-currency ledger. */
function exactDay(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(label + " must be YYYY-MM-DD.");
  const parsed = new Date(value + "T00:00:00Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(label + " is not a real date.");
  }
  return value;
}
export const getPayrollLiabilityRollforward = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; from: string; to: string }) => {
    const from = exactDay(input?.from, "From date");
    const to = exactDay(input?.to, "To date");
    const duration = Math.round(
      (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000,
    );
    if (duration < 0 || duration > 366) {
      throw new Error("Select a period of up to 367 calendar days (inclusive).");
    }
    return { companyId: assertUuid(input?.companyId), from, to };
  })
  .handler(async ({ data, context }): Promise<LiabilityRollforwardResult> => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.view");
    const sb = context.supabase;
    const { data: rawSettings, error: settingsError } = await sb
      .from("payroll_settings" as never)
      .select("company_id, net_pay_liability_account_id" as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (settingsError) throw new Error(settingsError.message);
    const settings = rawSettings as unknown as {
      company_id: string;
      net_pay_liability_account_id: string | null;
    } | null;
    if (
      !settings ||
      settings.company_id !== data.companyId ||
      !settings.net_pay_liability_account_id
    ) {
      throw new Error("Configure a Payroll net-pay liability account to run the roll-forward.");
    }

    const { data: rawAccount, error: accountError } = await sb
      .from("accounts" as never)
      .select("id, company_id, code, name, account_type" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, settings.net_pay_liability_account_id as never)
      .maybeSingle();
    if (accountError) throw new Error(accountError.message);
    const account = rawAccount as unknown as {
      id: string;
      company_id: string;
      code: string;
      name: string;
      account_type: string;
    } | null;
    if (
      !account ||
      account.company_id !== data.companyId ||
      account.id !== settings.net_pay_liability_account_id ||
      !account.code?.trim() ||
      account.account_type !== "liability"
    ) {
      throw new Error(
        "Payroll net-pay liability account is missing, invalid or no longer a liability.",
      );
    }

    // Prefer the existing report reader: only POSTED journals, exact FX-to-base
    // conversion and pagination with no silent record truncation.
    const meta = await loadCompanyMeta(sb as unknown as Sb, data.companyId);
    const [ledgerLines, runsResult, paymentsResult] = await Promise.all([
      loadPostedLines(sb as unknown as Sb, data.companyId, meta.baseCurrency, {
        accountIds: [account.id],
        to: data.to,
      }),
      sb
        .from("payroll_runs" as never)
        .select(
          "id, company_id, status, payment_date, currency, net_minor, accrual_journal_id" as never,
        )
        .eq("company_id" as never, data.companyId as never)
        .in("status" as never, ["posted", "paid", "complete"] as never)
        .gte("payment_date" as never, data.from as never)
        .lte("payment_date" as never, data.to as never)
        .order("id" as never)
        .limit(501),
      sb
        .from("payroll_payments" as never)
        .select(
          "id, company_id, status, payment_date, currency, amount_minor, unallocated_minor, journal_id" as never,
        )
        .eq("company_id" as never, data.companyId as never)
        .in("status" as never, ["posted", "reversed"] as never)
        .gte("payment_date" as never, data.from as never)
        .lte("payment_date" as never, data.to as never)
        .order("id" as never)
        .limit(501),
    ]);
    if (runsResult.error) throw new Error(runsResult.error.message);
    if (paymentsResult.error) throw new Error(paymentsResult.error.message);
    const runs = (runsResult.data ?? []) as unknown as LiabilitySourceRun[];
    const payments = (paymentsResult.data ?? []) as unknown as LiabilitySourcePayment[];
    if (runs.length >= 501 || payments.length >= 501) {
      throw new Error(
        "Payroll source evidence exceeds 500 records for this period. Choose a smaller date range.",
      );
    }
    return calculatePayrollLiabilityRollforward(
      data.companyId,
      meta.baseCurrency,
      account.id,
      account.code,
      account.name,
      data.from,
      data.to,
      ledgerLines.map((row) => ({
        line_id: row.line_id ?? "",
        journal_id: row.journal_id ?? "",
        journal_date: row.journal_date,
        source_type: row.source_type ?? "",
        source_id: row.source_id ?? null,
        account_id: row.account_id,
        debit_minor: row.debit_minor,
        credit_minor: row.credit_minor,
      })),
      runs,
      payments,
    );
  });
