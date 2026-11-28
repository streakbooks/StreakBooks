import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc, companyIdOf } from "@/lib/planning/rpc";

export const HR11_MIGRATION = "HR integrations need database update 20261109230000.";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
function pick(row: Record<string, unknown>, key: string): unknown {
  return row[key];
}
function str(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}
function strOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return str(value);
}
function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function asUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export type HrPayrollCompensationHandoff = {
  id: string;
  employeeId: string;
  employeeName: string | null;
  employeeNumber: string | null;
  effectiveOn: string;
  changeType: string;
  currencyCode: string;
  proposedAmount: number;
  status: string;
  notes: string | null;
  payrollHandoffNote: string | null;
};
export type HrPayrollOffboardingHandoff = {
  id: string;
  caseNumber: string;
  employeeId: string;
  employeeName: string | null;
  employeeNumber: string | null;
  lastWorkingDay: string;
  exitReason: string;
  payrollHandoffNote: string | null;
};

export const listHrPayrollHandoffs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.employees.manage");
    const raw = await callRpc(
      context.supabase,
      "list_hr_payroll_handoffs",
      {
        _company_id: data.companyId,
      },
      HR11_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      compensation: asUnknownArray(pick(row, "compensation")).map(
        (item): HrPayrollCompensationHandoff => {
          const c = asRecord(item);
          return {
            id: str(pick(c, "id")),
            employeeId: str(pick(c, "employeeId")),
            employeeName: strOrNull(pick(c, "employeeName")),
            employeeNumber: strOrNull(pick(c, "employeeNumber")),
            effectiveOn: str(pick(c, "effectiveOn")),
            changeType: str(pick(c, "changeType")),
            currencyCode: str(pick(c, "currencyCode")),
            proposedAmount: num(pick(c, "proposedAmount")),
            status: str(pick(c, "status")),
            notes: strOrNull(pick(c, "notes")),
            payrollHandoffNote: strOrNull(pick(c, "payrollHandoffNote")),
          };
        },
      ),
      offboarding: asUnknownArray(pick(row, "offboarding")).map(
        (item): HrPayrollOffboardingHandoff => {
          const o = asRecord(item);
          return {
            id: str(pick(o, "id")),
            caseNumber: str(pick(o, "caseNumber")),
            employeeId: str(pick(o, "employeeId")),
            employeeName: strOrNull(pick(o, "employeeName")),
            employeeNumber: strOrNull(pick(o, "employeeNumber")),
            lastWorkingDay: str(pick(o, "lastWorkingDay")),
            exitReason: str(pick(o, "exitReason")),
            payrollHandoffNote: strOrNull(pick(o, "payrollHandoffNote")),
          };
        },
      ),
    };
  });

export const applyHrCompensationHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; changeId: string; componentTypeId: string }) => ({
    companyId: companyIdOf(input),
    changeId: input.changeId,
    componentTypeId: input.componentTypeId,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.employees.manage");
    const raw = await callRpc(
      context.supabase,
      "apply_payroll_hr_compensation_handoff",
      {
        _company_id: data.companyId,
        _change_id: data.changeId,
        _component_type_id: data.componentTypeId,
      },
      HR11_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")),
      status: str(pick(row, "status")),
      payrollAppliedAt: strOrNull(pick(row, "payrollAppliedAt")),
    };
  });

export const applyHrOffboardingHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; caseId: string }) => ({
    companyId: companyIdOf(input),
    caseId: input.caseId,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.employees.manage");
    const raw = await callRpc(
      context.supabase,
      "apply_payroll_hr_offboarding_handoff",
      {
        _company_id: data.companyId,
        _case_id: data.caseId,
      },
      HR11_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")),
      caseNumber: str(pick(row, "caseNumber")),
      payrollAppliedAt: strOrNull(pick(row, "payrollAppliedAt")),
      employeeStatus: strOrNull(pick(row, "employeeStatus")),
    };
  });
