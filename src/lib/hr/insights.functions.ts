import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc, companyIdOf } from "@/lib/planning/rpc";
import type { Permission } from "@/lib/permissions";
import {
  HR12_MIGRATION,
  type HrAutomationRule,
  type HrAutomationRun,
  type HrEmployeeExportRow,
  type HrImportPreview,
  type HrReportColumn,
  type HrReportResult,
} from "@/lib/hr/insights-types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
function pick(row: Record<string, unknown>, key: string): unknown { return row[key]; }
function str(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function strOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return str(value);
}
function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}
function asUnknownArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
async function requireHr(
  supabase: Parameters<typeof assertCompanyMember>[0], companyId: string, permission: Permission,
) {
  await assertCompanyMember(supabase, companyId);
  await assertCompanyPermission(supabase, companyId, permission);
}

export const runHrReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string; reportId: string; dateFrom?: string | null; dateTo?: string | null;
  }) => ({
    companyId: companyIdOf(input),
    reportId: input.reportId,
    dateFrom: input.dateFrom?.trim() || null,
    dateTo: input.dateTo?.trim() || null,
  }))
  .handler(async ({ data, context }): Promise<HrReportResult> => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(context.supabase, "run_hr_report", {
      _company_id: data.companyId,
      _report_id: data.reportId,
      _date_from: data.dateFrom,
      _date_to: data.dateTo,
    }, HR12_MIGRATION);
    const row = asRecord(raw);
    return {
      reportId: str(pick(row, "reportId")),
      dateFrom: str(pick(row, "dateFrom")),
      dateTo: str(pick(row, "dateTo")),
      columns: asUnknownArray(pick(row, "columns")).map((c): HrReportColumn => {
        const col = asRecord(c);
        return { key: str(pick(col, "key")), label: str(pick(col, "label")) };
      }),
      rows: asUnknownArray(pick(row, "rows")).map((item) => {
        const r = asRecord(item);
        const out: Record<string, string | number | null> = {};
        for (const [k, v] of Object.entries(r)) {
          if (typeof v === "number") out[k] = v;
          else if (v === null || v === undefined) out[k] = null;
          else out[k] = str(v);
        }
        return out;
      }),
    };
  });

export const exportHrEmployeeDirectory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(context.supabase, "export_hr_employee_directory", {
      _company_id: data.companyId,
    }, HR12_MIGRATION);
    const row = asRecord(raw);
    return {
      generatedAt: str(pick(row, "generatedAt")),
      items: asUnknownArray(pick(row, "items")).map((item): HrEmployeeExportRow => {
        const e = asRecord(item);
        return {
          employeeNumber: str(pick(e, "employeeNumber")),
          firstName: str(pick(e, "firstName")),
          lastName: str(pick(e, "lastName")),
          email: strOrNull(pick(e, "email")),
          status: str(pick(e, "status")),
          hireDate: str(pick(e, "hireDate")),
          terminationDate: strOrNull(pick(e, "terminationDate")),
          department: strOrNull(pick(e, "department")),
          designation: strOrNull(pick(e, "designation")),
          location: strOrNull(pick(e, "location")),
          managerEmployeeNumber: strOrNull(pick(e, "managerEmployeeNumber")),
          workArrangement: strOrNull(pick(e, "workArrangement")),
        };
      }),
    };
  });

export const previewHrEmployeeImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string;
    rows: Array<Record<string, string | null>>;
  }) => ({ companyId: companyIdOf(input), rows: input.rows }))
  .handler(async ({ data, context }): Promise<HrImportPreview> => {
    await requireHr(context.supabase, data.companyId, "hr.employees.manage");
    const raw = await callRpc(context.supabase, "preview_hr_employee_import", {
      _company_id: data.companyId, _rows: data.rows,
    }, HR12_MIGRATION);
    const row = asRecord(raw);
    return {
      dryRun: true,
      accepted: num(pick(row, "accepted")),
      warnings: num(pick(row, "warnings")),
      errors: num(pick(row, "errors")),
      issues: asUnknownArray(pick(row, "issues")).map((i) => {
        const x = asRecord(i);
        return { row: num(pick(x, "row")), level: str(pick(x, "level")), message: str(pick(x, "message")) };
      }),
      note: str(pick(row, "note")),
    };
  });

export const listHrAutomationRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.settings.edit");
    const raw = await callRpc(context.supabase, "list_hr_automation_rules", {
      _company_id: data.companyId,
    }, HR12_MIGRATION);
    const row = asRecord(raw);
    return {
      items: asUnknownArray(pick(row, "items")).map((item): HrAutomationRule => {
        const r = asRecord(item);
        const cfg = pick(r, "config");
        return {
          id: str(pick(r, "id")), code: str(pick(r, "code")), name: str(pick(r, "name")),
          triggerKind: str(pick(r, "triggerKind")), isEnabled: bool(pick(r, "isEnabled"), true),
          config: cfg && typeof cfg === "object" ? (cfg as Record<string, unknown>) : {},
          lastRunAt: strOrNull(pick(r, "lastRunAt")), lastRunStatus: strOrNull(pick(r, "lastRunStatus")),
          lastRunSummary: strOrNull(pick(r, "lastRunSummary")), updatedAt: str(pick(r, "updatedAt")),
        };
      }),
      runs: asUnknownArray(pick(row, "runs")).map((item): HrAutomationRun => {
        const r = asRecord(item);
        return {
          id: str(pick(r, "id")), ruleId: str(pick(r, "ruleId")), status: str(pick(r, "status")),
          summary: str(pick(r, "summary")), startedAt: str(pick(r, "startedAt")),
          finishedAt: str(pick(r, "finishedAt")),
        };
      }),
    };
  });

export const upsertHrAutomationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string;
    payload: {
      id?: string | null; code: string; name: string; triggerKind: string;
      isEnabled: boolean; config?: Record<string, unknown>;
    };
  }) => ({ companyId: companyIdOf(input), payload: input.payload }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.settings.edit");
    const raw = await callRpc(context.supabase, "upsert_hr_automation_rule", {
      _company_id: data.companyId, _payload: data.payload,
    }, HR12_MIGRATION);
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")), code: str(pick(row, "code")),
      isEnabled: bool(pick(row, "isEnabled"), true), triggerKind: str(pick(row, "triggerKind")),
    };
  });

export const runHrAutomations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; ruleId?: string | null }) => ({
    companyId: companyIdOf(input), ruleId: input.ruleId?.trim() || null,
  }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.settings.edit");
    await callRpc(context.supabase, "run_hr_automations", {
      _company_id: data.companyId, _rule_id: data.ruleId,
    }, HR12_MIGRATION);
    return { ok: true as const };
  });