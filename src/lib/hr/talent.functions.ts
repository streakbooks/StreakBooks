import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc, companyIdOf } from "@/lib/planning/rpc";
import type { Permission } from "@/lib/permissions";
import {
  HR09_MIGRATION,
  type HrCompensationChange,
  type HrPerformanceCycle,
  type HrPerformanceGoal,
  type HrTrainingCourse,
  type HrTrainingEnrollment,
} from "@/lib/hr/talent-types";

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
function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

export const listHrPerformanceCycles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(context.supabase, "list_hr_performance_cycles", { _company_id: data.companyId }, HR09_MIGRATION);
    return {
      items: asUnknownArray(pick(asRecord(raw), "items")).map((item): HrPerformanceCycle => {
        const row = asRecord(item);
        return {
          id: str(pick(row, "id")), code: str(pick(row, "code")), name: str(pick(row, "name")),
          startsOn: str(pick(row, "startsOn")), endsOn: str(pick(row, "endsOn")), status: str(pick(row, "status")),
        };
      }),
    };
  });

export const upsertHrPerformanceCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string;
    payload: { id?: string | null; code: string; name: string; startsOn: string; endsOn: string; status: string };
  }) => ({ companyId: companyIdOf(input), payload: input.payload }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.performance.manage");
    const raw = await callRpc(context.supabase, "upsert_hr_performance_cycle", {
      _company_id: data.companyId, _payload: data.payload,
    }, HR09_MIGRATION);
    const row = asRecord(raw);
    return { id: str(pick(row, "id")), code: str(pick(row, "code")), status: str(pick(row, "status")) };
  });

export const listHrPerformanceGoals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; cycleId?: string | null }) => ({
    companyId: companyIdOf(input), cycleId: input.cycleId?.trim() || null,
  }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(context.supabase, "list_hr_performance_goals", {
      _company_id: data.companyId, _cycle_id: data.cycleId,
    }, HR09_MIGRATION);
    return {
      items: asUnknownArray(pick(asRecord(raw), "items")).map((item): HrPerformanceGoal => {
        const row = asRecord(item);
        return {
          id: str(pick(row, "id")), cycleId: str(pick(row, "cycleId")), employeeId: str(pick(row, "employeeId")),
          employeeName: strOrNull(pick(row, "employeeName")), title: str(pick(row, "title")),
          status: str(pick(row, "status")), targetValue: numOrNull(pick(row, "targetValue")),
          currentValue: numOrNull(pick(row, "currentValue")), weightPercent: num(pick(row, "weightPercent")),
          dueOn: strOrNull(pick(row, "dueOn")),
        };
      }),
    };
  });

export const upsertHrPerformanceGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string;
    payload: {
      id?: string | null; cycleId: string; employeeId: string; title: string; status: string;
      targetValue: number | null; currentValue: number | null; weightPercent: number;
      dueOn: string | null; notes: string | null;
    };
  }) => ({ companyId: companyIdOf(input), payload: input.payload }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.performance.manage");
    const raw = await callRpc(context.supabase, "upsert_hr_performance_goal", {
      _company_id: data.companyId, _payload: data.payload,
    }, HR09_MIGRATION);
    const row = asRecord(raw);
    return { id: str(pick(row, "id")), title: str(pick(row, "title")), status: str(pick(row, "status")) };
  });

export const listHrTraining = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(context.supabase, "list_hr_training", { _company_id: data.companyId }, HR09_MIGRATION);
    const row = asRecord(raw);
    return {
      courses: asUnknownArray(pick(row, "courses")).map((item): HrTrainingCourse => {
        const c = asRecord(item);
        return {
          id: str(pick(c, "id")), code: str(pick(c, "code")), name: str(pick(c, "name")),
          provider: strOrNull(pick(c, "provider")), isActive: bool(pick(c, "isActive"), true),
        };
      }),
      enrollments: asUnknownArray(pick(row, "enrollments")).map((item): HrTrainingEnrollment => {
        const e = asRecord(item);
        return {
          id: str(pick(e, "id")), courseId: str(pick(e, "courseId")),
          courseCode: strOrNull(pick(e, "courseCode")), courseName: strOrNull(pick(e, "courseName")),
          employeeId: str(pick(e, "employeeId")), employeeName: strOrNull(pick(e, "employeeName")),
          status: str(pick(e, "status")), enrolledOn: str(pick(e, "enrolledOn")),
          completedOn: strOrNull(pick(e, "completedOn")), certificateName: strOrNull(pick(e, "certificateName")),
        };
      }),
    };
  });

export const upsertHrTrainingCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string;
    payload: { id?: string | null; code: string; name: string; provider: string | null; isActive: boolean };
  }) => ({ companyId: companyIdOf(input), payload: input.payload }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.performance.manage");
    const raw = await callRpc(context.supabase, "upsert_hr_training_course", {
      _company_id: data.companyId, _payload: data.payload,
    }, HR09_MIGRATION);
    const row = asRecord(raw);
    return { id: str(pick(row, "id")), code: str(pick(row, "code")), name: str(pick(row, "name")) };
  });

export const upsertHrTrainingEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string;
    payload: {
      id?: string | null; courseId: string; employeeId: string; status: string;
      enrolledOn: string | null; completedOn: string | null; certificateName: string | null; notes: string | null;
    };
  }) => ({ companyId: companyIdOf(input), payload: input.payload }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.performance.manage");
    const raw = await callRpc(context.supabase, "upsert_hr_training_enrollment", {
      _company_id: data.companyId, _payload: data.payload,
    }, HR09_MIGRATION);
    const row = asRecord(raw);
    return { id: str(pick(row, "id")), status: str(pick(row, "status")) };
  });

export const listHrCompensationChanges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.employees.sensitive");
    const raw = await callRpc(context.supabase, "list_hr_compensation_changes", { _company_id: data.companyId }, HR09_MIGRATION);
    return {
      items: asUnknownArray(pick(asRecord(raw), "items")).map((item): HrCompensationChange => {
        const row = asRecord(item);
        return {
          id: str(pick(row, "id")), employeeId: str(pick(row, "employeeId")),
          employeeName: strOrNull(pick(row, "employeeName")), employeeNumber: strOrNull(pick(row, "employeeNumber")),
          effectiveOn: str(pick(row, "effectiveOn")), changeType: str(pick(row, "changeType")),
          currencyCode: str(pick(row, "currencyCode")), proposedAmount: num(pick(row, "proposedAmount")),
          status: str(pick(row, "status")), notes: strOrNull(pick(row, "notes")),
          payrollHandoffNote: strOrNull(pick(row, "payrollHandoffNote")), updatedAt: str(pick(row, "updatedAt")),
        };
      }),
    };
  });

export const upsertHrCompensationChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string;
    payload: {
      id?: string | null; employeeId: string; effectiveOn: string; changeType: string;
      currencyCode: string; proposedAmount: number; status: string;
      notes: string | null; payrollHandoffNote: string | null;
    };
  }) => ({ companyId: companyIdOf(input), payload: input.payload }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.employees.sensitive");
    const raw = await callRpc(context.supabase, "upsert_hr_compensation_change", {
      _company_id: data.companyId, _payload: data.payload,
    }, HR09_MIGRATION);
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")), status: str(pick(row, "status")), proposedAmount: num(pick(row, "proposedAmount")),
    };
  });