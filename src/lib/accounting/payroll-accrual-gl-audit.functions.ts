import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import {
  auditPayrollAccrualTieOut,
  type PayrollAuditRun,
  type PayrollAuditSettings,
  type PayrollAuditEmployee,
  type PayrollAuditSourceLine,
  type PayrollAuditComponent,
  type PayrollAuditJournal,
  type PayrollAuditGlLine,
  type PayrollAccrualTieOutResult,
} from "./payroll-accrual-gl-audit";

/**
 * Source-to-ledger payroll accrual audit, strictly read-only and tenant-scoped.
 * All row limits fail closed; no truncated source evidence can appear matched.
 */
export const auditPayrollAccrualGl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; runId: string; journalId: string }) => ({
    companyId: assertUuid(input?.companyId),
    runId: assertUuid(input?.runId, "payroll run"),
    journalId: assertUuid(input?.journalId, "journal"),
  }))
  .handler(async ({ data, context }): Promise<PayrollAccrualTieOutResult> => {
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.view");
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const sb = context.supabase;

    const { data: rawRun, error: runError } = await sb
      .from("payroll_runs" as never)
      .select("id, company_id, run_number, status, currency, payment_date, net_minor, accrual_journal_id, posting_idempotency_key" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.runId as never)
      .maybeSingle();
    if (runError) throw new Error(runError.message);
    if (!rawRun) throw new Error("Payroll run source evidence is unavailable.");
    const run = rawRun as unknown as PayrollAuditRun;
    if (run.company_id !== data.companyId || run.id !== data.runId) {
      throw new Error("Payroll run source identity is invalid.");
    }
    if (!run.accrual_journal_id || run.accrual_journal_id !== data.journalId) {
      throw new Error("Payroll accrual journal does not match the selected run.");
    }

    const { data: rawJournal, error: journalError } = await sb
      .from("journals" as never)
      .select("id, company_id, status, source_type, source_id, idempotency_key, currency_code, journal_date, reversed_by_journal_id" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.journalId as never)
      .maybeSingle();
    if (journalError) throw new Error(journalError.message);
    if (!rawJournal) throw new Error("Payroll-linked accounting journal is missing.");
    const journal = rawJournal as unknown as PayrollAuditJournal;
    if (journal.company_id !== data.companyId || journal.id !== data.journalId) {
      throw new Error("Payroll GL journal identity is invalid.");
    }

    const { data: rawSettings, error: settingsError } = await sb
      .from("payroll_settings" as never)
      .select("company_id, salary_expense_account_id, deduction_liability_account_id, employer_expense_account_id, employer_liability_account_id, net_pay_liability_account_id" as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (settingsError) throw new Error(settingsError.message);
    if (!rawSettings) throw new Error("Payroll account-settings source evidence is missing.");
    const settings = rawSettings as unknown as PayrollAuditSettings;

    const { data: rawEmployees, error: employeesError } = await sb
      .from("payroll_run_employees" as never)
      .select("id, company_id, run_id, status" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("run_id" as never, data.runId as never)
      .order("id" as never)
      .limit(201);
    if (employeesError) throw new Error(employeesError.message);
    const employees = (rawEmployees ?? []) as unknown as PayrollAuditEmployee[];
    if (employees.length >= 201) {
      throw new Error("Payroll employee source evidence exceeds the 200-row audit limit.");
    }
    const included = employees.filter((employee) => employee.status === "included").map((e) => e.id);
    if (!included.length) throw new Error("Posted payroll has no included employee evidence.");

    const { data: rawSources, error: sourcesError } = await sb
      .from("payroll_run_lines" as never)
      .select("id, company_id, run_employee_id, component_type_id, kind, amount_minor" as never)
      .eq("company_id" as never, data.companyId as never)
      .in("run_employee_id" as never, included as never)
      .order("id" as never)
      .limit(1001);
    if (sourcesError) throw new Error(sourcesError.message);
    const sources = (rawSources ?? []) as unknown as PayrollAuditSourceLine[];
    if (sources.length >= 1001) {
      throw new Error("Payroll component source evidence exceeds the 1000-row audit limit.");
    }
    const componentIds = [...new Set(sources.map((line) => line.component_type_id)
      .filter((id): id is string => Boolean(id)))];
    if (componentIds.length > 150) {
      throw new Error("Payroll component mappings exceed the 150-account audit limit.");
    }
    let components: PayrollAuditComponent[] = [];
    if (componentIds.length) {
      const { data: rawComponents, error: componentsError } = await sb
        .from("payroll_component_types" as never)
        .select("id, company_id, expense_account_id, liability_account_id" as never)
        .eq("company_id" as never, data.companyId as never)
        .in("id" as never, componentIds as never)
        .limit(151);
      if (componentsError) throw new Error(componentsError.message);
      components = (rawComponents ?? []) as unknown as PayrollAuditComponent[];
      if (components.length > componentIds.length || components.length >= 151) {
        throw new Error("Payroll component account mappings exceed expected evidence bounds.");
      }
    }

    const { data: rawGlLines, error: glError } = await sb
      .from("journal_lines" as never)
      .select("id, company_id, journal_id, account_id, line_no, debit_minor, credit_minor" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("journal_id" as never, data.journalId as never)
      .order("line_no" as never)
      .limit(501);
    if (glError) throw new Error(glError.message);
    const glLines = (rawGlLines ?? []) as unknown as PayrollAuditGlLine[];
    if (glLines.length >= 501) {
      throw new Error("Payroll GL journal exceeds the 500-line audit limit; no incomplete match returned.");
    }
    return auditPayrollAccrualTieOut(
      data.companyId, run, settings, employees, sources, components, journal, glLines,
    );
  });
