import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import {
  reviewPayrollPaymentGl,
  type PaymentAuditPayment,
  type PaymentAuditAllocation,
  type PaymentAuditPayslip,
  type PaymentAuditRun,
  type PaymentAuditJournal,
  type PaymentAuditGlLine,
  type PaymentAuditAccount,
  type PaymentAuditResult,
} from "./payroll-payment-gl-audit";

/** Read-only, company-scoped, bounded Payroll payment / net-pay GL evidence. */
export const auditPayrollPaymentGl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; paymentId: string; journalId: string }) => ({
    companyId: assertUuid(input?.companyId),
    paymentId: assertUuid(input?.paymentId, "payroll payment"),
    journalId: assertUuid(input?.journalId, "journal"),
  }))
  .handler(async ({ data, context }): Promise<PaymentAuditResult> => {
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.view");
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const sb = context.supabase;
    const { data: rawPayment, error: payError } = await sb
      .from("payroll_payments" as never)
      .select("id, company_id, payment_date, amount_minor, unallocated_minor, currency, clearing_account_id, journal_id, status, idempotency_key, reversal_journal_id" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.paymentId as never)
      .maybeSingle();
    if (payError) throw new Error(payError.message);
    if (!rawPayment) throw new Error("Payroll payment source record was not found.");
    const payment = rawPayment as unknown as PaymentAuditPayment;
    if (payment.id !== data.paymentId || payment.company_id !== data.companyId || payment.journal_id !== data.journalId) {
      throw new Error("Selected journal does not match an authorised Payroll payment.");
    }

    const { data: rawJournal, error: journalError } = await sb
      .from("journals" as never)
      .select("id, company_id, status, source_type, source_id, idempotency_key, journal_date, currency_code, reverses_journal_id, reversed_by_journal_id" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.journalId as never)
      .maybeSingle();
    if (journalError) throw new Error(journalError.message);
    if (!rawJournal) throw new Error("Payroll payment's posted journal was not found.");
    const journal = rawJournal as unknown as PaymentAuditJournal;
    if (journal.id !== data.journalId || journal.company_id !== data.companyId) {
      throw new Error("Selected Payroll GL journal belongs to another organisation.");
    }

    let reversal: PaymentAuditJournal | null = null;
    if (payment.reversal_journal_id) {
      const { data: rawRev, error: revError } = await sb
        .from("journals" as never)
        .select("id, company_id, status, source_type, source_id, idempotency_key, journal_date, currency_code, reverses_journal_id, reversed_by_journal_id" as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("id" as never, payment.reversal_journal_id as never)
        .maybeSingle();
      if (revError) throw new Error(revError.message);
      reversal = (rawRev ?? null) as PaymentAuditJournal | null;
    }

    const { data: rawAllocations, error: allocationError } = await sb
      .from("payroll_payment_allocations" as never)
      .select("id, company_id, payment_id, payslip_id, run_id, run_employee_id, amount_minor" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("payment_id" as never, data.paymentId as never)
      .order("id" as never)
      .limit(101);
    if (allocationError) throw new Error(allocationError.message);
    const allocations = (rawAllocations ?? []) as unknown as PaymentAuditAllocation[];
    if (allocations.length >= 101) {
      throw new Error("Payroll payment exceeds 100 allocations; an incomplete audit cannot be approved.");
    }
    const payslipIds = [...new Set(allocations.map(a => a.payslip_id).filter(Boolean))];
    const runIds = [...new Set(allocations.map(a => a.run_id).filter(Boolean))];
    let payslips: PaymentAuditPayslip[] = [];
    let runs: PaymentAuditRun[] = [];
    if (payslipIds.length) {
      const { data: rawSlips, error } = await sb
        .from("payroll_payslips" as never)
        .select("id, company_id, run_id, run_employee_id" as never)
        .eq("company_id" as never, data.companyId as never)
        .in("id" as never, payslipIds as never)
        .limit(101);
      if (error) throw new Error(error.message);
      payslips = (rawSlips ?? []) as unknown as PaymentAuditPayslip[];
      if (payslips.length > payslipIds.length || payslips.length >= 101) {
        throw new Error("Payslip evidence exceeds the bounded audit scope.");
      }
    }
    if (runIds.length) {
      const { data: rawRuns, error } = await sb
        .from("payroll_runs" as never)
        .select("id, company_id, status, accrual_journal_id" as never)
        .eq("company_id" as never, data.companyId as never)
        .in("id" as never, runIds as never)
        .limit(101);
      if (error) throw new Error(error.message);
      runs = (rawRuns ?? []) as unknown as PaymentAuditRun[];
      if (runs.length > runIds.length || runs.length >= 101) {
        throw new Error("Payroll run evidence exceeds the bounded audit scope.");
      }
    }

    const { data: rawSettings, error: settingsError } = await sb
      .from("payroll_settings" as never)
      .select("company_id, net_pay_liability_account_id" as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (settingsError) throw new Error(settingsError.message);
    const settings = rawSettings as { company_id?: string; net_pay_liability_account_id?: string | null } | null;
    if (!settings || settings.company_id !== data.companyId) {
      throw new Error("Payroll liability account settings are not available for this organisation.");
    }

    const glJournalIds = [...new Set([journal.id, reversal?.id].filter(
      (id): id is string => Boolean(id),
    ))];
    const { data: rawLines, error: lineError } = await sb
      .from("journal_lines" as never)
      .select("id, company_id, journal_id, line_no, account_id, debit_minor, credit_minor" as never)
      .eq("company_id" as never, data.companyId as never)
      .in("journal_id" as never, glJournalIds as never)
      .order("journal_id" as never)
      .order("line_no" as never)
      .limit(11);
    if (lineError) throw new Error(lineError.message);
    const allLines = (rawLines ?? []) as unknown as PaymentAuditGlLine[];
    if (allLines.length >= 11) throw new Error("Payroll payment GL exceeds ten lines; no partial audit returned.");
    const originalLines = allLines.filter(line => line.journal_id === journal.id);
    const reversalLines = reversal ? allLines.filter(line => line.journal_id === reversal.id) : [];
    if (allLines.length !== originalLines.length + reversalLines.length) {
      throw new Error("Unexpected journal line identity in the payment GL result.");
    }

    const accountIds = [...new Set([
      payment.clearing_account_id, settings.net_pay_liability_account_id,
      ...allLines.map(line => line.account_id),
    ].filter((id): id is string => Boolean(id)))];
    if (accountIds.length > 10) throw new Error("Payroll payment GL account evidence is out of bounds.");
    let accounts: PaymentAuditAccount[] = [];
    if (accountIds.length) {
      const { data: rawAccounts, error } = await sb
        .from("accounts" as never)
        .select("id, company_id, code, name" as never)
        .eq("company_id" as never, data.companyId as never)
        .in("id" as never, accountIds as never)
        .limit(11);
      if (error) throw new Error(error.message);
      accounts = (rawAccounts ?? []) as unknown as PaymentAuditAccount[];
      if (accounts.length >= 11 || accounts.length > accountIds.length) {
        throw new Error("Payroll GL account evidence exceeds the audit boundary.");
      }
    }

    return reviewPayrollPaymentGl(
      data.companyId, payment, allocations, payslips, runs, journal, reversal,
      originalLines, reversalLines, accounts, settings.net_pay_liability_account_id ?? null,
    );
  });
