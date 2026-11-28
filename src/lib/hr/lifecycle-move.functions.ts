import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc, companyIdOf } from "@/lib/planning/rpc";
import type { Permission } from "@/lib/permissions";
import {
  HR10_MIGRATION,
  type HrOffboardingCaseDetail,
  type HrOffboardingCaseListItem,
  type HrOffboardingTask,
  type HrTransferRequest,
} from "@/lib/hr/lifecycle-move-types";

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
function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}
function asUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
async function requireHr(
  supabase: Parameters<typeof assertCompanyMember>[0],
  companyId: string,
  permission: Permission,
) {
  await assertCompanyMember(supabase, companyId);
  await assertCompanyPermission(supabase, companyId, permission);
}

function mapTransfer(raw: unknown): HrTransferRequest {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    requestNumber: str(pick(row, "requestNumber")),
    employeeId: str(pick(row, "employeeId")),
    employeeName: strOrNull(pick(row, "employeeName")),
    employeeNumber: strOrNull(pick(row, "employeeNumber")),
    changeType: str(pick(row, "changeType")),
    effectiveOn: str(pick(row, "effectiveOn")),
    status: str(pick(row, "status")),
    toDepartmentId: strOrNull(pick(row, "toDepartmentId")),
    toDepartmentName: strOrNull(pick(row, "toDepartmentName")),
    toDesignationId: strOrNull(pick(row, "toDesignationId")),
    toDesignationName: strOrNull(pick(row, "toDesignationName")),
    toLocationId: strOrNull(pick(row, "toLocationId")),
    toLocationName: strOrNull(pick(row, "toLocationName")),
    toManagerEmployeeId: strOrNull(pick(row, "toManagerEmployeeId")),
    toManagerName: strOrNull(pick(row, "toManagerName")),
    toWorkArrangement: strOrNull(pick(row, "toWorkArrangement")),
    reason: strOrNull(pick(row, "reason")),
    appliedAt: strOrNull(pick(row, "appliedAt")),
    updatedAt: str(pick(row, "updatedAt")),
  };
}

function mapOffboardingList(raw: unknown): HrOffboardingCaseListItem {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    caseNumber: str(pick(row, "caseNumber")),
    employeeId: str(pick(row, "employeeId")),
    employeeName: strOrNull(pick(row, "employeeName")),
    employeeNumber: strOrNull(pick(row, "employeeNumber")),
    status: str(pick(row, "status")),
    exitReason: str(pick(row, "exitReason")),
    lastWorkingDay: str(pick(row, "lastWorkingDay")),
    noticeDate: strOrNull(pick(row, "noticeDate")),
    completedAt: strOrNull(pick(row, "completedAt")),
    readyForPayroll: bool(pick(row, "readyForPayroll"), false),
    payrollHandoffNote: strOrNull(pick(row, "payrollHandoffNote")),
    pendingTasks: num(pick(row, "pendingTasks")),
    updatedAt: str(pick(row, "updatedAt")),
  };
}

function mapTask(raw: unknown): HrOffboardingTask {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    title: str(pick(row, "title")),
    ownerRole: str(pick(row, "ownerRole")),
    status: str(pick(row, "status")),
    dueOn: strOrNull(pick(row, "dueOn")),
    completedAt: strOrNull(pick(row, "completedAt")),
    isRequired: bool(pick(row, "isRequired"), true),
    sortOrder: num(pick(row, "sortOrder"), 100),
    notes: strOrNull(pick(row, "notes")),
  };
}

export const listHrTransferRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; status?: string | null }) => ({
    companyId: companyIdOf(input),
    status: input.status?.trim() || null,
  }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(
      context.supabase,
      "list_hr_transfer_requests",
      {
        _company_id: data.companyId,
        _status: data.status,
      },
      HR10_MIGRATION,
    );
    return { items: asUnknownArray(pick(asRecord(raw), "items")).map(mapTransfer) };
  });

export const upsertHrTransferRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      payload: {
        id?: string | null;
        employeeId: string;
        changeType: string;
        effectiveOn: string;
        status: string;
        toDepartmentId: string | null;
        toDesignationId: string | null;
        toLocationId: string | null;
        toBranchId: string | null;
        toManagerEmployeeId: string | null;
        toWorkArrangement: string | null;
        reason: string | null;
      };
    }) => ({ companyId: companyIdOf(input), payload: input.payload }),
  )
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.employees.manage");
    const raw = await callRpc(
      context.supabase,
      "upsert_hr_transfer_request",
      {
        _company_id: data.companyId,
        _payload: data.payload,
      },
      HR10_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")),
      requestNumber: str(pick(row, "requestNumber")),
      status: str(pick(row, "status")),
    };
  });

export const decideHrTransferRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      requestId: string;
      decision: "approve" | "reject" | "cancel";
      rejectionReason?: string | null;
    }) => ({
      companyId: companyIdOf(input),
      requestId: input.requestId,
      decision: input.decision,
      rejectionReason: input.rejectionReason?.trim() || null,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.employees.manage");
    const raw = await callRpc(
      context.supabase,
      "decide_hr_transfer_request",
      {
        _company_id: data.companyId,
        _request_id: data.requestId,
        _decision: data.decision,
        _rejection_reason: data.rejectionReason,
      },
      HR10_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")),
      requestNumber: str(pick(row, "requestNumber")),
      status: str(pick(row, "status")),
      appliedAt: strOrNull(pick(row, "appliedAt")),
    };
  });

export const listHrOffboardingCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; status?: string | null }) => ({
    companyId: companyIdOf(input),
    status: input.status?.trim() || null,
  }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(
      context.supabase,
      "list_hr_offboarding_cases",
      {
        _company_id: data.companyId,
        _status: data.status,
      },
      HR10_MIGRATION,
    );
    return { items: asUnknownArray(pick(asRecord(raw), "items")).map(mapOffboardingList) };
  });

function mapOffboardingDetail(raw: unknown): HrOffboardingCaseDetail {
  const row = asRecord(raw);
  const c = asRecord(pick(row, "case"));
  return {
    case: {
      id: str(pick(c, "id")),
      caseNumber: str(pick(c, "caseNumber")),
      employeeId: str(pick(c, "employeeId")),
      employeeName: strOrNull(pick(c, "employeeName")),
      employeeNumber: strOrNull(pick(c, "employeeNumber")),
      status: str(pick(c, "status")),
      exitReason: str(pick(c, "exitReason")),
      lastWorkingDay: str(pick(c, "lastWorkingDay")),
      noticeDate: strOrNull(pick(c, "noticeDate")),
      completedAt: strOrNull(pick(c, "completedAt")),
      readyForPayroll: bool(pick(c, "readyForPayroll"), false),
      payrollHandoffNote: strOrNull(pick(c, "payrollHandoffNote")),
      notes: strOrNull(pick(c, "notes")),
      version: num(pick(c, "version"), 1),
    },
    tasks: asUnknownArray(pick(row, "tasks")).map(mapTask),
  };
}

export const getHrOffboardingCase = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; caseId: string }) => ({
    companyId: companyIdOf(input),
    caseId: input.caseId,
  }))
  .handler(async ({ data, context }): Promise<HrOffboardingCaseDetail> => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(
      context.supabase,
      "get_hr_offboarding_case",
      {
        _company_id: data.companyId,
        _case_id: data.caseId,
      },
      HR10_MIGRATION,
    );
    return mapOffboardingDetail(raw);
  });

export const createHrOffboardingCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      payload: {
        employeeId: string;
        lastWorkingDay: string;
        exitReason: string;
        noticeDate: string | null;
        payrollHandoffNote: string | null;
        notes: string | null;
      };
    }) => ({ companyId: companyIdOf(input), payload: input.payload }),
  )
  .handler(async ({ data, context }): Promise<HrOffboardingCaseDetail> => {
    await requireHr(context.supabase, data.companyId, "hr.employees.manage");
    const raw = await callRpc(
      context.supabase,
      "create_hr_offboarding_case",
      {
        _company_id: data.companyId,
        _payload: data.payload,
      },
      HR10_MIGRATION,
    );
    return mapOffboardingDetail(raw);
  });

export const updateHrOffboardingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { companyId: string; taskId: string; status: string; notes?: string | null }) => ({
      companyId: companyIdOf(input),
      taskId: input.taskId,
      status: input.status,
      notes: input.notes?.trim() || null,
    }),
  )
  .handler(async ({ data, context }): Promise<HrOffboardingCaseDetail> => {
    await requireHr(context.supabase, data.companyId, "hr.employees.manage");
    const raw = await callRpc(
      context.supabase,
      "update_hr_offboarding_task",
      {
        _company_id: data.companyId,
        _task_id: data.taskId,
        _status: data.status,
        _notes: data.notes,
      },
      HR10_MIGRATION,
    );
    return mapOffboardingDetail(raw);
  });
