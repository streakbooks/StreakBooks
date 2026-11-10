import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc, companyIdOf } from "@/lib/planning/rpc";
import type { Permission } from "@/lib/permissions";
import {
  HR07_MIGRATION,
  type HrApprovalItem,
  type HrManagerTeamMember,
  type HrSelfAttendance,
  type HrSelfContext,
  type HrSelfLeaveRequest,
} from "@/lib/hr/workspace-types";

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

function mapSelfContext(raw: unknown): HrSelfContext {
  const row = asRecord(raw);
  const empRaw = pick(row, "employee");
  const profileRaw = pick(row, "profile");
  const emp = empRaw && typeof empRaw === "object" ? asRecord(empRaw) : null;
  const profile = profileRaw && typeof profileRaw === "object" ? asRecord(profileRaw) : null;
  return {
    linked: bool(pick(row, "linked")),
    message: strOrNull(pick(row, "message")),
    employee: emp
      ? {
          id: str(pick(emp, "id")),
          employeeNumber: str(pick(emp, "employeeNumber")),
          firstName: str(pick(emp, "firstName")),
          lastName: str(pick(emp, "lastName")),
          email: strOrNull(pick(emp, "email")),
          status: str(pick(emp, "status")),
          hireDate: strOrNull(pick(emp, "hireDate")),
        }
      : null,
    profile: profile
      ? {
          preferredName: strOrNull(pick(profile, "preferredName")),
          personalEmail: strOrNull(pick(profile, "personalEmail")),
          personalPhone: strOrNull(pick(profile, "personalPhone")),
          workPhone: strOrNull(pick(profile, "workPhone")),
          managerEmployeeId: strOrNull(pick(profile, "managerEmployeeId")),
          departmentId: strOrNull(pick(profile, "departmentId")),
          designationId: strOrNull(pick(profile, "designationId")),
          locationId: strOrNull(pick(profile, "locationId")),
          workArrangement: strOrNull(pick(profile, "workArrangement")),
          emergencyContactName: strOrNull(pick(profile, "emergencyContactName")),
          emergencyContactPhone: strOrNull(pick(profile, "emergencyContactPhone")),
          emergencyContactRelation: strOrNull(pick(profile, "emergencyContactRelation")),
        }
      : null,
  };
}

function mapSelfLeave(raw: unknown): HrSelfLeaveRequest {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    requestNumber: str(pick(row, "requestNumber")),
    leaveTypeId: str(pick(row, "leaveTypeId")),
    leaveTypeCode: strOrNull(pick(row, "leaveTypeCode")),
    leaveTypeName: strOrNull(pick(row, "leaveTypeName")),
    startDate: str(pick(row, "startDate")),
    endDate: str(pick(row, "endDate")),
    days: num(pick(row, "days")),
    status: str(pick(row, "status")),
    reason: strOrNull(pick(row, "reason")),
    updatedAt: str(pick(row, "updatedAt")),
  };
}

function mapSelfAttendance(raw: unknown): HrSelfAttendance {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    workDate: str(pick(row, "workDate")),
    checkInAt: strOrNull(pick(row, "checkInAt")),
    checkOutAt: strOrNull(pick(row, "checkOutAt")),
    source: str(pick(row, "source")),
    status: str(pick(row, "status")),
    notes: strOrNull(pick(row, "notes")),
  };
}

function mapTeamMember(raw: unknown): HrManagerTeamMember {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    employeeNumber: str(pick(row, "employeeNumber")),
    firstName: str(pick(row, "firstName")),
    lastName: str(pick(row, "lastName")),
    status: str(pick(row, "status")),
    departmentName: strOrNull(pick(row, "departmentName")),
    designationName: strOrNull(pick(row, "designationName")),
  };
}

function mapApproval(raw: unknown): HrApprovalItem {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    kind: str(pick(row, "kind")),
    requestNumber: strOrNull(pick(row, "requestNumber")),
    employeeId: str(pick(row, "employeeId")),
    employeeName: strOrNull(pick(row, "employeeName")),
    summary: str(pick(row, "summary")),
    status: str(pick(row, "status")),
    updatedAt: str(pick(row, "updatedAt")),
  };
}

export const getHrSelfContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: companyIdOf(input),
  }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.self_service");
    const raw = await callRpc(
      context.supabase,
      "get_hr_self_context",
      { _company_id: data.companyId },
      HR07_MIGRATION,
    );
    return mapSelfContext(raw);
  });

export const updateHrSelfProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      payload: {
        preferredName: string | null;
        personalEmail: string | null;
        personalPhone: string | null;
        workPhone: string | null;
        emergencyContactName: string | null;
        emergencyContactPhone: string | null;
        emergencyContactRelation: string | null;
      };
    }) => ({
      companyId: companyIdOf(input),
      payload: input.payload,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.self_service");
    const raw = await callRpc(
      context.supabase,
      "update_hr_self_profile",
      { _company_id: data.companyId, _payload: data.payload },
      HR07_MIGRATION,
    );
    const row = asRecord(raw);
    return { employeeId: str(pick(row, "employeeId")), ok: bool(pick(row, "ok"), true) };
  });

export const listHrSelfLeaveRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: companyIdOf(input),
  }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.self_service");
    const raw = await callRpc(
      context.supabase,
      "list_hr_self_leave_requests",
      { _company_id: data.companyId },
      HR07_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      linked: bool(pick(row, "linked")),
      employeeId: strOrNull(pick(row, "employeeId")),
      items: asUnknownArray(pick(row, "items")).map(mapSelfLeave),
    };
  });

export const createHrSelfLeaveRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      payload: {
        leaveTypeId: string;
        startDate: string;
        endDate: string;
        days: number | null;
        status: string;
        reason: string | null;
      };
    }) => ({
      companyId: companyIdOf(input),
      payload: input.payload,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.self_service");
    const raw = await callRpc(
      context.supabase,
      "create_hr_self_leave_request",
      { _company_id: data.companyId, _payload: data.payload },
      HR07_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")),
      requestNumber: str(pick(row, "requestNumber")),
      status: str(pick(row, "status")),
    };
  });

export const listHrSelfAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: companyIdOf(input),
  }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.self_service");
    const raw = await callRpc(
      context.supabase,
      "list_hr_self_attendance",
      { _company_id: data.companyId, _from_date: null, _to_date: null },
      HR07_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      linked: bool(pick(row, "linked")),
      employeeId: strOrNull(pick(row, "employeeId")),
      items: asUnknownArray(pick(row, "items")).map(mapSelfAttendance),
    };
  });

export const clockHrSelfAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      action: "check_in" | "check_out";
      workDate: string | null;
      notes: string | null;
    }) => ({
      companyId: companyIdOf(input),
      action: input.action,
      workDate: input.workDate,
      notes: input.notes,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.self_service");
    const raw = await callRpc(
      context.supabase,
      "clock_hr_self_attendance",
      {
        _company_id: data.companyId,
        _action: data.action,
        _work_date: data.workDate,
        _notes: data.notes,
      },
      HR07_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")),
      workDate: str(pick(row, "workDate")),
      checkInAt: strOrNull(pick(row, "checkInAt")),
      checkOutAt: strOrNull(pick(row, "checkOutAt")),
      status: str(pick(row, "status")),
    };
  });

export const listHrManagerTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: companyIdOf(input),
  }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.manager");
    const raw = await callRpc(
      context.supabase,
      "list_hr_manager_team",
      { _company_id: data.companyId },
      HR07_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      linked: bool(pick(row, "linked")),
      managerEmployeeId: strOrNull(pick(row, "managerEmployeeId")),
      message: strOrNull(pick(row, "message")),
      items: asUnknownArray(pick(row, "items")).map(mapTeamMember),
    };
  });

export const listHrApprovalsInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: companyIdOf(input),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc(
      context.supabase,
      "list_hr_approvals_inbox",
      { _company_id: data.companyId },
      HR07_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      leave: asUnknownArray(pick(row, "leave")).map(mapApproval),
      attendanceCorrections: asUnknownArray(pick(row, "attendanceCorrections")).map(mapApproval),
    };
  });

export const linkHrEmployeeUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; employeeId: string; userId: string | null }) => ({
      companyId: companyIdOf(input),
      employeeId: input.employeeId,
      userId: input.userId,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.employees.manage");
    const raw = await callRpc(
      context.supabase,
      "link_hr_employee_user",
      {
        _company_id: data.companyId,
        _employee_id: data.employeeId,
        _user_id: data.userId,
      },
      HR07_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      employeeId: str(pick(row, "employeeId")),
      linkedUserId: strOrNull(pick(row, "linkedUserId")),
    };
  });