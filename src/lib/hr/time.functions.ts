import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc, companyIdOf } from "@/lib/planning/rpc";
import type { Permission } from "@/lib/permissions";
import {
  HR05_MIGRATION,
  HR06_MIGRATION,
  type HrAttendanceCorrection,
  type HrAttendanceLog,
  type HrHoliday,
  type HrHolidayCalendar,
  type HrLeaveBalance,
  type HrLeaveRequest,
  type HrLeaveType,
  type HrShiftAssignment,
  type HrShiftTemplate,
} from "@/lib/hr/time-types";

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

function mapShift(raw: unknown): HrShiftTemplate {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    code: str(pick(row, "code")),
    name: str(pick(row, "name")),
    timezone: str(pick(row, "timezone") || "UTC"),
    startTime: str(pick(row, "startTime")),
    endTime: str(pick(row, "endTime")),
    breakMinutes: num(pick(row, "breakMinutes"), 60),
    weeklyOffMask: num(pick(row, "weeklyOffMask"), 65),
    isActive: bool(pick(row, "isActive"), true),
    sortOrder: num(pick(row, "sortOrder"), 100),
    notes: strOrNull(pick(row, "notes")),
    updatedAt: str(pick(row, "updatedAt")),
  };
}

function mapAssignment(raw: unknown): HrShiftAssignment {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    employeeId: str(pick(row, "employeeId")),
    employeeName: strOrNull(pick(row, "employeeName")),
    employeeNumber: strOrNull(pick(row, "employeeNumber")),
    shiftTemplateId: str(pick(row, "shiftTemplateId")),
    shiftCode: strOrNull(pick(row, "shiftCode")),
    shiftName: strOrNull(pick(row, "shiftName")),
    effectiveFrom: str(pick(row, "effectiveFrom")),
    effectiveTo: strOrNull(pick(row, "effectiveTo")),
    notes: strOrNull(pick(row, "notes")),
    updatedAt: str(pick(row, "updatedAt")),
  };
}

function mapAttendanceLog(raw: unknown): HrAttendanceLog {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    employeeId: str(pick(row, "employeeId")),
    employeeName: strOrNull(pick(row, "employeeName")),
    employeeNumber: strOrNull(pick(row, "employeeNumber")),
    workDate: str(pick(row, "workDate")),
    checkInAt: strOrNull(pick(row, "checkInAt")),
    checkOutAt: strOrNull(pick(row, "checkOutAt")),
    source: str(pick(row, "source")),
    status: str(pick(row, "status")) as HrAttendanceLog["status"],
    notes: strOrNull(pick(row, "notes")),
    updatedAt: str(pick(row, "updatedAt")),
  };
}

function mapCorrection(raw: unknown): HrAttendanceCorrection {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    attendanceLogId: strOrNull(pick(row, "attendanceLogId")),
    employeeId: str(pick(row, "employeeId")),
    employeeName: strOrNull(pick(row, "employeeName")),
    employeeNumber: strOrNull(pick(row, "employeeNumber")),
    workDate: str(pick(row, "workDate")),
    requestedCheckInAt: strOrNull(pick(row, "requestedCheckInAt")),
    requestedCheckOutAt: strOrNull(pick(row, "requestedCheckOutAt")),
    reason: str(pick(row, "reason")),
    status: str(pick(row, "status")) as HrAttendanceCorrection["status"],
    decisionNotes: strOrNull(pick(row, "decisionNotes")),
    decidedAt: strOrNull(pick(row, "decidedAt")),
    updatedAt: str(pick(row, "updatedAt")),
  };
}

function mapLeaveType(raw: unknown): HrLeaveType {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    code: str(pick(row, "code")),
    name: str(pick(row, "name")),
    isPaid: bool(pick(row, "isPaid"), true),
    requiresApproval: bool(pick(row, "requiresApproval"), true),
    annualAllowanceDays: num(pick(row, "annualAllowanceDays")),
    accrualMethod: str(pick(row, "accrualMethod") || "annual") as HrLeaveType["accrualMethod"],
    isActive: bool(pick(row, "isActive"), true),
    sortOrder: num(pick(row, "sortOrder"), 100),
    notes: strOrNull(pick(row, "notes")),
    updatedAt: str(pick(row, "updatedAt")),
  };
}

function mapLeaveBalance(raw: unknown): HrLeaveBalance {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    employeeId: str(pick(row, "employeeId")),
    employeeName: strOrNull(pick(row, "employeeName")),
    employeeNumber: strOrNull(pick(row, "employeeNumber")),
    leaveTypeId: str(pick(row, "leaveTypeId")),
    leaveTypeCode: strOrNull(pick(row, "leaveTypeCode")),
    leaveTypeName: strOrNull(pick(row, "leaveTypeName")),
    balanceYear: num(pick(row, "balanceYear")),
    entitledDays: num(pick(row, "entitledDays")),
    usedDays: num(pick(row, "usedDays")),
    pendingDays: num(pick(row, "pendingDays")),
    carriedDays: num(pick(row, "carriedDays")),
    availableDays: num(pick(row, "availableDays")),
    updatedAt: str(pick(row, "updatedAt")),
  };
}

function mapLeaveRequest(raw: unknown): HrLeaveRequest {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    requestNumber: str(pick(row, "requestNumber")),
    employeeId: str(pick(row, "employeeId")),
    employeeName: strOrNull(pick(row, "employeeName")),
    employeeNumber: strOrNull(pick(row, "employeeNumber")),
    leaveTypeId: str(pick(row, "leaveTypeId")),
    leaveTypeCode: strOrNull(pick(row, "leaveTypeCode")),
    leaveTypeName: strOrNull(pick(row, "leaveTypeName")),
    startDate: str(pick(row, "startDate")),
    endDate: str(pick(row, "endDate")),
    days: num(pick(row, "days")),
    status: str(pick(row, "status")) as HrLeaveRequest["status"],
    reason: strOrNull(pick(row, "reason")),
    decisionNotes: strOrNull(pick(row, "decisionNotes")),
    decidedAt: strOrNull(pick(row, "decidedAt")),
    updatedAt: str(pick(row, "updatedAt")),
  };
}

function mapHolidayCalendar(raw: unknown): HrHolidayCalendar {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    code: str(pick(row, "code")),
    name: str(pick(row, "name")),
    locationId: strOrNull(pick(row, "locationId")),
    isDefault: bool(pick(row, "isDefault")),
    isActive: bool(pick(row, "isActive"), true),
    notes: strOrNull(pick(row, "notes")),
    holidayCount: num(pick(row, "holidayCount")),
    updatedAt: str(pick(row, "updatedAt")),
  };
}

function mapHoliday(raw: unknown): HrHoliday {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    calendarId: str(pick(row, "calendarId")),
    calendarCode: strOrNull(pick(row, "calendarCode")),
    holidayDate: str(pick(row, "holidayDate")),
    name: str(pick(row, "name")),
    isOptional: bool(pick(row, "isOptional")),
    notes: strOrNull(pick(row, "notes")),
    updatedAt: str(pick(row, "updatedAt")),
  };
}

export const listHrShiftTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({
    companyId: companyIdOf(input),
  }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(
      context.supabase,
      "list_hr_shift_templates",
      { _company_id: data.companyId },
      HR05_MIGRATION,
    );
    return { items: asUnknownArray(pick(asRecord(raw), "items")).map(mapShift) };
  });

export const upsertHrShiftTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      payload: {
        id?: string | null;
        code: string;
        name: string;
        timezone: string | null;
        startTime: string;
        endTime: string;
        breakMinutes: number;
        weeklyOffMask: number;
        isActive: boolean;
        sortOrder: number;
        notes: string | null;
      };
    }) => ({
      companyId: companyIdOf(input),
      payload: input.payload,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.attendance.manage");
    const raw = await callRpc(
      context.supabase,
      "upsert_hr_shift_template",
      { _company_id: data.companyId, _payload: data.payload },
      HR05_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")),
      code: str(pick(row, "code")),
      name: str(pick(row, "name")),
    };
  });

export const listHrShiftAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; employeeId?: string | null }) => ({
    companyId: companyIdOf(input),
    employeeId: input.employeeId?.trim() || null,
  }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(
      context.supabase,
      "list_hr_shift_assignments",
      { _company_id: data.companyId, _employee_id: data.employeeId },
      HR05_MIGRATION,
    );
    return { items: asUnknownArray(pick(asRecord(raw), "items")).map(mapAssignment) };
  });

export const upsertHrShiftAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      payload: {
        id?: string | null;
        employeeId: string;
        shiftTemplateId: string;
        effectiveFrom: string;
        effectiveTo: string | null;
        notes: string | null;
      };
    }) => ({
      companyId: companyIdOf(input),
      payload: input.payload,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.attendance.manage");
    const raw = await callRpc(
      context.supabase,
      "upsert_hr_shift_assignment",
      { _company_id: data.companyId, _payload: data.payload },
      HR05_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")),
      employeeId: str(pick(row, "employeeId")),
      shiftTemplateId: str(pick(row, "shiftTemplateId")),
    };
  });

export const listHrAttendanceLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      fromDate?: string | null;
      toDate?: string | null;
      status?: string | null;
      employeeId?: string | null;
    }) => ({
      companyId: companyIdOf(input),
      fromDate: input.fromDate?.trim() || null,
      toDate: input.toDate?.trim() || null,
      status: input.status?.trim() || null,
      employeeId: input.employeeId?.trim() || null,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(
      context.supabase,
      "list_hr_attendance_logs",
      {
        _company_id: data.companyId,
        _from_date: data.fromDate,
        _to_date: data.toDate,
        _status: data.status,
        _employee_id: data.employeeId,
      },
      HR05_MIGRATION,
    );
    return { items: asUnknownArray(pick(asRecord(raw), "items")).map(mapAttendanceLog) };
  });

export const upsertHrAttendanceLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      payload: {
        id?: string | null;
        employeeId: string;
        workDate: string;
        checkInAt: string | null;
        checkOutAt: string | null;
        source: string;
        status: string;
        notes: string | null;
      };
    }) => ({
      companyId: companyIdOf(input),
      payload: input.payload,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.attendance.manage");
    const raw = await callRpc(
      context.supabase,
      "upsert_hr_attendance_log",
      { _company_id: data.companyId, _payload: data.payload },
      HR05_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")),
      employeeId: str(pick(row, "employeeId")),
      workDate: str(pick(row, "workDate")),
      status: str(pick(row, "status")),
    };
  });

export const listHrAttendanceCorrections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; status?: string | null }) => ({
    companyId: companyIdOf(input),
    status: input.status?.trim() || null,
  }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(
      context.supabase,
      "list_hr_attendance_corrections",
      { _company_id: data.companyId, _status: data.status },
      HR05_MIGRATION,
    );
    return { items: asUnknownArray(pick(asRecord(raw), "items")).map(mapCorrection) };
  });

export const upsertHrAttendanceCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      payload: {
        id?: string | null;
        employeeId: string;
        workDate: string;
        requestedCheckInAt: string | null;
        requestedCheckOutAt: string | null;
        reason: string;
      };
    }) => ({
      companyId: companyIdOf(input),
      payload: input.payload,
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc(
      context.supabase,
      "upsert_hr_attendance_correction",
      { _company_id: data.companyId, _payload: data.payload },
      HR05_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")),
      status: str(pick(row, "status")),
      workDate: str(pick(row, "workDate")),
    };
  });

export const decideHrAttendanceCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      correctionId: string;
      decision: "approved" | "rejected";
      decisionNotes: string | null;
    }) => ({
      companyId: companyIdOf(input),
      correctionId: input.correctionId,
      decision: input.decision,
      decisionNotes: input.decisionNotes,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.attendance.manage");
    const raw = await callRpc(
      context.supabase,
      "decide_hr_attendance_correction",
      {
        _company_id: data.companyId,
        _correction_id: data.correctionId,
        _decision: data.decision,
        _decision_notes: data.decisionNotes,
      },
      HR05_MIGRATION,
    );
    const row = asRecord(raw);
    return { id: str(pick(row, "id")), status: str(pick(row, "status")) };
  });

export const listHrLeaveTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({
    companyId: companyIdOf(input),
  }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(
      context.supabase,
      "list_hr_leave_types",
      { _company_id: data.companyId },
      HR06_MIGRATION,
    );
    return { items: asUnknownArray(pick(asRecord(raw), "items")).map(mapLeaveType) };
  });

export const upsertHrLeaveType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      payload: {
        id?: string | null;
        code: string;
        name: string;
        isPaid: boolean;
        requiresApproval: boolean;
        annualAllowanceDays: number;
        accrualMethod: string;
        isActive: boolean;
        sortOrder: number;
        notes: string | null;
      };
    }) => ({
      companyId: companyIdOf(input),
      payload: input.payload,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.leave.manage");
    const raw = await callRpc(
      context.supabase,
      "upsert_hr_leave_type",
      { _company_id: data.companyId, _payload: data.payload },
      HR06_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")),
      code: str(pick(row, "code")),
      name: str(pick(row, "name")),
    };
  });

export const listHrLeaveBalances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; year?: number | null; employeeId?: string | null }) => ({
    companyId: companyIdOf(input),
    year: input.year ?? null,
    employeeId: input.employeeId?.trim() || null,
  }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(
      context.supabase,
      "list_hr_leave_balances",
      {
        _company_id: data.companyId,
        _year: data.year,
        _employee_id: data.employeeId,
      },
      HR06_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      year: num(pick(row, "year")),
      items: asUnknownArray(pick(row, "items")).map(mapLeaveBalance),
    };
  });

export const ensureHrLeaveBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      employeeId: string;
      leaveTypeId: string;
      year: number | null;
    }) => ({
      companyId: companyIdOf(input),
      employeeId: input.employeeId,
      leaveTypeId: input.leaveTypeId,
      year: input.year,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.leave.manage");
    const raw = await callRpc(
      context.supabase,
      "ensure_hr_leave_balance",
      {
        _company_id: data.companyId,
        _employee_id: data.employeeId,
        _leave_type_id: data.leaveTypeId,
        _year: data.year,
      },
      HR06_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")),
      employeeId: str(pick(row, "employeeId")),
      leaveTypeId: str(pick(row, "leaveTypeId")),
      balanceYear: num(pick(row, "balanceYear")),
      entitledDays: num(pick(row, "entitledDays")),
      availableDays: num(pick(row, "availableDays")),
    };
  });

export const listHrLeaveRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { companyId: string; status?: string | null; employeeId?: string | null }) => ({
      companyId: companyIdOf(input),
      status: input.status?.trim() || null,
      employeeId: input.employeeId?.trim() || null,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(
      context.supabase,
      "list_hr_leave_requests",
      {
        _company_id: data.companyId,
        _status: data.status,
        _employee_id: data.employeeId,
      },
      HR06_MIGRATION,
    );
    return { items: asUnknownArray(pick(asRecord(raw), "items")).map(mapLeaveRequest) };
  });

export const upsertHrLeaveRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      payload: {
        id?: string | null;
        employeeId: string;
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
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc(
      context.supabase,
      "upsert_hr_leave_request",
      { _company_id: data.companyId, _payload: data.payload },
      HR06_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")),
      requestNumber: str(pick(row, "requestNumber")),
      status: str(pick(row, "status")),
      days: num(pick(row, "days")),
    };
  });

export const decideHrLeaveRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      requestId: string;
      decision: "approved" | "rejected" | "cancelled";
      decisionNotes: string | null;
    }) => ({
      companyId: companyIdOf(input),
      requestId: input.requestId,
      decision: input.decision,
      decisionNotes: input.decisionNotes,
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc(
      context.supabase,
      "decide_hr_leave_request",
      {
        _company_id: data.companyId,
        _request_id: data.requestId,
        _decision: data.decision,
        _decision_notes: data.decisionNotes,
      },
      HR06_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")),
      requestNumber: str(pick(row, "requestNumber")),
      status: str(pick(row, "status")),
    };
  });

export const listHrHolidayCalendars = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({
    companyId: companyIdOf(input),
  }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(
      context.supabase,
      "list_hr_holiday_calendars",
      { _company_id: data.companyId },
      HR06_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      calendars: asUnknownArray(pick(row, "calendars")).map(mapHolidayCalendar),
      holidays: asUnknownArray(pick(row, "holidays")).map(mapHoliday),
    };
  });

export const upsertHrHolidayCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      payload: {
        id?: string | null;
        code: string;
        name: string;
        locationId: string | null;
        isDefault: boolean;
        isActive: boolean;
        notes: string | null;
      };
    }) => ({
      companyId: companyIdOf(input),
      payload: input.payload,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.leave.manage");
    const raw = await callRpc(
      context.supabase,
      "upsert_hr_holiday_calendar",
      { _company_id: data.companyId, _payload: data.payload },
      HR06_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")),
      code: str(pick(row, "code")),
      name: str(pick(row, "name")),
    };
  });

export const upsertHrHoliday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      payload: {
        id?: string | null;
        calendarId: string;
        holidayDate: string;
        name: string;
        isOptional: boolean;
        notes: string | null;
      };
    }) => ({
      companyId: companyIdOf(input),
      payload: input.payload,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.leave.manage");
    const raw = await callRpc(
      context.supabase,
      "upsert_hr_holiday",
      { _company_id: data.companyId, _payload: data.payload },
      HR06_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")),
      name: str(pick(row, "name")),
      holidayDate: str(pick(row, "holidayDate")),
    };
  });
