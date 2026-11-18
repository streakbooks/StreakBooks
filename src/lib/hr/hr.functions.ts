import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc, companyIdOf } from "@/lib/planning/rpc";
import type {
  HrAuditEvent,
  HrDashboardKpis,
  HrEmployeeDetail,
  HrEmployeeListItem,
  HrEmployeeProfile,
  HrOrgUnits,
  HrSettings,
} from "@/lib/hr/types";
import { HR_DISCLAIMER, HR_WORK_ARRANGEMENTS } from "@/lib/hr/types";
import type { Permission } from "@/lib/permissions";

export const HR_MIGRATION =
  "HR Management is not available yet: the database update 20261109190000 has not been applied.";

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

async function requireHrPermission(
  supabase: Parameters<typeof assertCompanyMember>[0],
  companyId: string,
  permission: Permission,
) {
  await assertCompanyMember(supabase, companyId);
  await assertCompanyPermission(supabase, companyId, permission);
}

function mapSettings(raw: unknown): HrSettings {
  const row = asRecord(raw);
  return {
    companyId: str(pick(row, "companyId")),
    enabled: bool(pick(row, "enabled")),
    defaultTimezone: str(pick(row, "defaultTimezone") || "UTC"),
    weekStartsOn: num(pick(row, "weekStartsOn"), 1),
    requireManagerForLeave: bool(pick(row, "requireManagerForLeave"), true),
    disclaimerAcknowledged: bool(pick(row, "disclaimerAcknowledged")),
    version: num(pick(row, "version"), 1),
    updatedAt: strOrNull(pick(row, "updatedAt")),
    disclaimer: str(pick(row, "disclaimer") || HR_DISCLAIMER),
  };
}

function mapKpis(raw: unknown): HrDashboardKpis {
  const row = asRecord(raw);
  return {
    enabled: bool(pick(row, "enabled")),
    activeEmployees: num(pick(row, "activeEmployees")),
    archivedEmployees: num(pick(row, "archivedEmployees")),
    terminatedEmployees: num(pick(row, "terminatedEmployees")),
    profilesLinked: num(pick(row, "profilesLinked")),
    departments: num(pick(row, "departments")),
    locations: num(pick(row, "locations")),
    pendingApprovals: num(pick(row, "pendingApprovals")),
    attendanceExceptions: num(pick(row, "attendanceExceptions")),
    expiringDocuments: num(pick(row, "expiringDocuments")),
    payrollHandoffsPending: num(pick(row, "payrollHandoffsPending")),
  };
}

function mapEmployeeItem(raw: unknown): HrEmployeeListItem {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    employeeNumber: str(pick(row, "employeeNumber")),
    firstName: str(pick(row, "firstName")),
    lastName: str(pick(row, "lastName")),
    email: strOrNull(pick(row, "email")),
    status: str(pick(row, "status")),
    hireDate: str(pick(row, "hireDate")),
    payrollDepartment: strOrNull(pick(row, "payrollDepartment")),
    payrollDesignation: strOrNull(pick(row, "payrollDesignation")),
    payrollWorkLocation: strOrNull(pick(row, "payrollWorkLocation")),
    employmentType: str(pick(row, "employmentType")),
    preferredName: strOrNull(pick(row, "preferredName")),
    managerEmployeeId: strOrNull(pick(row, "managerEmployeeId")),
    departmentId: strOrNull(pick(row, "departmentId")),
    designationId: strOrNull(pick(row, "designationId")),
    locationId: strOrNull(pick(row, "locationId")),
    workArrangement: strOrNull(pick(row, "workArrangement")),
    departmentName: strOrNull(pick(row, "departmentName")),
    designationName: strOrNull(pick(row, "designationName")),
    locationName: strOrNull(pick(row, "locationName")),
  };
}

function mapProfile(raw: unknown): HrEmployeeProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const row = asRecord(raw);
  const arrangement = str(pick(row, "workArrangement") || "onsite");
  return {
    preferredName: strOrNull(pick(row, "preferredName")),
    legalMiddleName: strOrNull(pick(row, "legalMiddleName")),
    personalEmail: strOrNull(pick(row, "personalEmail")),
    personalPhone: strOrNull(pick(row, "personalPhone")),
    workPhone: strOrNull(pick(row, "workPhone")),
    managerEmployeeId: strOrNull(pick(row, "managerEmployeeId")),
    departmentId: strOrNull(pick(row, "departmentId")),
    designationId: strOrNull(pick(row, "designationId")),
    locationId: strOrNull(pick(row, "locationId")),
    branchId: strOrNull(pick(row, "branchId")),
    workArrangement: (HR_WORK_ARRANGEMENTS.includes(arrangement as never)
      ? arrangement
      : "onsite") as HrEmployeeProfile["workArrangement"],
    probationEndDate: strOrNull(pick(row, "probationEndDate")),
    emergencyContactName: strOrNull(pick(row, "emergencyContactName")),
    emergencyContactPhone: strOrNull(pick(row, "emergencyContactPhone")),
    emergencyContactRelation: strOrNull(pick(row, "emergencyContactRelation")),
    linkedUserId: strOrNull(pick(row, "linkedUserId")),
    notes: strOrNull(pick(row, "notes")),
    version: num(pick(row, "version"), 1),
  };
}

function asUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function mapOrg(raw: unknown): HrOrgUnits {
  const row = asRecord(raw);
  const locations = asUnknownArray(pick(row, "locations"));
  const branches = asUnknownArray(pick(row, "branches"));
  const departments = asUnknownArray(pick(row, "departments"));
  const designations = asUnknownArray(pick(row, "designations"));
  return {
    locations: locations.map((item) => {
      const r = asRecord(item);
      return {
        id: str(pick(r, "id")),
        code: str(pick(r, "code")),
        name: str(pick(r, "name")),
        timezone: str(pick(r, "timezone") || "UTC"),
        countryCode: strOrNull(pick(r, "countryCode")),
        isActive: bool(pick(r, "isActive"), true),
        sortOrder: num(pick(r, "sortOrder"), 100),
      };
    }),
    branches: branches.map((item) => {
      const r = asRecord(item);
      return {
        id: str(pick(r, "id")),
        locationId: strOrNull(pick(r, "locationId")),
        code: str(pick(r, "code")),
        name: str(pick(r, "name")),
        isActive: bool(pick(r, "isActive"), true),
        sortOrder: num(pick(r, "sortOrder"), 100),
      };
    }),
    departments: departments.map((item) => {
      const r = asRecord(item);
      return {
        id: str(pick(r, "id")),
        parentId: strOrNull(pick(r, "parentId")),
        code: str(pick(r, "code")),
        name: str(pick(r, "name")),
        costCentre: strOrNull(pick(r, "costCentre")),
        isActive: bool(pick(r, "isActive"), true),
        sortOrder: num(pick(r, "sortOrder"), 100),
      };
    }),
    designations: designations.map((item) => {
      const r = asRecord(item);
      return {
        id: str(pick(r, "id")),
        code: str(pick(r, "code")),
        name: str(pick(r, "name")),
        gradeCode: strOrNull(pick(r, "gradeCode")),
        isActive: bool(pick(r, "isActive"), true),
        sortOrder: num(pick(r, "sortOrder"), 100),
      };
    }),
  };
}

function mapEmployeeDetail(raw: unknown): HrEmployeeDetail {
  const row = asRecord(raw);
  const employee = asRecord(pick(row, "employee"));
  const history = asUnknownArray(pick(row, "positionHistory"));
  return {
    employee: {
      id: str(pick(employee, "id")),
      employeeNumber: str(pick(employee, "employeeNumber")),
      firstName: str(pick(employee, "firstName")),
      lastName: str(pick(employee, "lastName")),
      email: strOrNull(pick(employee, "email")),
      status: str(pick(employee, "status")),
      hireDate: str(pick(employee, "hireDate")),
      terminationDate: strOrNull(pick(employee, "terminationDate")),
      employmentType: str(pick(employee, "employmentType")),
      payrollDepartment: strOrNull(pick(employee, "payrollDepartment")),
      payrollDesignation: strOrNull(pick(employee, "payrollDesignation")),
      payrollWorkLocation: strOrNull(pick(employee, "payrollWorkLocation")),
      payrollCountryCode: str(pick(employee, "payrollCountryCode")),
      payrollCurrency: str(pick(employee, "payrollCurrency")),
    },
    profile: mapProfile(pick(row, "profile")),
    positionHistory: history.map((item) => {
      const h = asRecord(item);
      return {
        id: str(pick(h, "id")),
        effectiveFrom: str(pick(h, "effectiveFrom")),
        effectiveTo: strOrNull(pick(h, "effectiveTo")),
        changeType: str(pick(h, "changeType")),
        departmentId: strOrNull(pick(h, "departmentId")),
        designationId: strOrNull(pick(h, "designationId")),
        locationId: strOrNull(pick(h, "locationId")),
        managerEmployeeId: strOrNull(pick(h, "managerEmployeeId")),
        reason: strOrNull(pick(h, "reason")),
      };
    }),
  };
}

export const getHrSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }) => {
    await requireHrPermission(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(
      context.supabase,
      "get_hr_settings",
      { _company_id: data.companyId },
      HR_MIGRATION,
    );
    return mapSettings(raw);
  });

export const upsertHrSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      enabled: boolean;
      defaultTimezone?: string;
      weekStartsOn?: number;
      requireManagerForLeave?: boolean;
      disclaimerAcknowledged?: boolean;
      expectedVersion?: number;
    }) => ({
      companyId: companyIdOf(input),
      enabled: Boolean(input.enabled),
      defaultTimezone: input.defaultTimezone?.trim().slice(0, 64),
      weekStartsOn: input.weekStartsOn,
      requireManagerForLeave: input.requireManagerForLeave,
      disclaimerAcknowledged: input.disclaimerAcknowledged,
      expectedVersion: input.expectedVersion,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireHrPermission(context.supabase, data.companyId, "hr.settings.edit");
    const raw = await callRpc(
      context.supabase,
      "upsert_hr_settings",
      {
        _company_id: data.companyId,
        _enabled: data.enabled,
        _default_timezone: data.defaultTimezone ?? null,
        _week_starts_on: data.weekStartsOn ?? null,
        _require_manager_for_leave: data.requireManagerForLeave ?? null,
        _disclaimer_acknowledged: data.disclaimerAcknowledged ?? null,
        _expected_version: data.expectedVersion ?? null,
      },
      HR_MIGRATION,
    );
    return mapSettings(raw);
  });

export const getHrDashboardKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }) => {
    await requireHrPermission(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(
      context.supabase,
      "get_hr_dashboard_kpis",
      { _company_id: data.companyId },
      HR_MIGRATION,
    );
    return mapKpis(raw);
  });

export const listHrEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      status?: string;
      search?: string;
      limit?: number;
      offset?: number;
    }) => {
      const out: {
        companyId: string;
        status: string | null;
        search: string | null;
        limit?: number;
        offset?: number;
      } = {
        companyId: companyIdOf(input),
        status: input.status?.trim() || null,
        search: input.search?.trim() || null,
      };
      if (input.limit !== undefined) out.limit = input.limit;
      if (input.offset !== undefined) out.offset = input.offset;
      return out;
    },
  )
  .handler(async ({ data, context }) => {
    await requireHrPermission(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(
      context.supabase,
      "list_hr_employees",
      {
        _company_id: data.companyId,
        _status: data.status,
        _search: data.search,
        _limit: data.limit ?? 100,
        _offset: data.offset ?? 0,
      },
      HR_MIGRATION,
    );
    const row = asRecord(raw);
    const items: HrEmployeeListItem[] = asUnknownArray(pick(row, "items")).map(mapEmployeeItem);
    return { items, limit: num(pick(row, "limit"), 100), offset: num(pick(row, "offset"), 0) };
  });

export const getHrEmployee = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; employeeId: string }) => ({
    companyId: companyIdOf(input),
    employeeId: input.employeeId,
  }))
  .handler(async ({ data, context }) => {
    await requireHrPermission(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(
      context.supabase,
      "get_hr_employee",
      { _company_id: data.companyId, _employee_id: data.employeeId },
      HR_MIGRATION,
    );
    return mapEmployeeDetail(raw);
  });

export const upsertHrEmployeeProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; employeeId: string; payload: Record<string, unknown> }) => ({
      companyId: companyIdOf(input),
      employeeId: input.employeeId,
      payload: input.payload,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireHrPermission(context.supabase, data.companyId, "hr.employees.manage");
    const raw = await callRpc(
      context.supabase,
      "upsert_hr_employee_profile",
      {
        _company_id: data.companyId,
        _employee_id: data.employeeId,
        _payload: data.payload,
      },
      HR_MIGRATION,
    );
    return mapEmployeeDetail(raw);
  });

export const listHrOrgUnits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<HrOrgUnits> => {
    await requireHrPermission(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(
      context.supabase,
      "list_hr_org_units",
      { _company_id: data.companyId },
      HR_MIGRATION,
    );
    return mapOrg(raw);
  });

export const upsertHrOrgUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      kind: "location" | "branch" | "department" | "designation";
      payload: {
        id?: string | null;
        code?: string;
        name?: string;
        timezone?: string;
        countryCode?: string;
        addressLine1?: string;
        city?: string;
        region?: string;
        postalCode?: string;
        locationId?: string | null;
        parentId?: string | null;
        costCentre?: string;
        gradeCode?: string;
        isActive?: boolean;
        sortOrder?: number;
      };
    }) => ({
      companyId: companyIdOf(input),
      kind: input.kind,
      payload: input.payload,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireHrPermission(context.supabase, data.companyId, "hr.organization.manage");
    const raw = await callRpc(
      context.supabase,
      "upsert_hr_org_unit",
      {
        _company_id: data.companyId,
        _kind: data.kind,
        _payload: data.payload,
      },
      HR_MIGRATION,
    );
    const row = asRecord(raw);
    return { id: str(pick(row, "id")), kind: str(pick(row, "kind") || data.kind) };
  });

export const listHrAuditEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; limit?: number; offset?: number }) => ({
    companyId: companyIdOf(input),
    limit: Number(input.limit ?? 100),
    offset: Number(input.offset ?? 0),
  }))
  .handler(async ({ data, context }) => {
    await requireHrPermission(context.supabase, data.companyId, "hr.audit.view");
    const raw = await callRpc(
      context.supabase,
      "list_hr_audit_events",
      {
        _company_id: data.companyId,
        _limit: data.limit,
        _offset: data.offset,
      },
      HR_MIGRATION,
    );
    const row = asRecord(raw);
    const items: HrAuditEvent[] = asUnknownArray(pick(row, "items")).map((item) => {
      const r = asRecord(item);
      return {
        id: str(pick(r, "id")),
        actorUserId: strOrNull(pick(r, "actorUserId")),
        entityType: str(pick(r, "entityType")),
        entityId: strOrNull(pick(r, "entityId")),
        action: str(pick(r, "action")),
        summary: str(pick(r, "summary")),
        createdAt: str(pick(r, "createdAt")),
      };
    });
    return { items };
  });

/** Demo-only: re-seed HR org/profiles from payroll employees (server still enforces is_demo). */
export const seedHrDemoWorkforce = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }) => {
    await requireHrPermission(context.supabase, data.companyId, "hr.settings.edit");
    const raw = await callRpc(
      context.supabase,
      "seed_hr_demo_workforce",
      { _company_id: data.companyId },
      "HR demo seed needs database update 20261109260000.",
    );
    const row = asRecord(raw);
    return {
      skipped: bool(pick(row, "skipped")),
      reason: strOrNull(pick(row, "reason")),
      profilesUpserted: num(pick(row, "profilesUpserted")),
    };
  });
