import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc, companyIdOf } from "@/lib/planning/rpc";
import type { Permission } from "@/lib/permissions";
import {
  HR04_MIGRATION,
  type HrApplication,
  type HrOnboardingCaseDetail,
  type HrOnboardingCaseListItem,
  type HrOnboardingTemplate,
  type HrRequisition,
} from "@/lib/hr/lifecycle-types";

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

function mapRequisition(raw: unknown): HrRequisition {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    requisitionNumber: str(pick(row, "requisitionNumber")),
    title: str(pick(row, "title")),
    departmentId: strOrNull(pick(row, "departmentId")),
    designationId: strOrNull(pick(row, "designationId")),
    locationId: strOrNull(pick(row, "locationId")),
    employmentType: str(pick(row, "employmentType")),
    headcount: num(pick(row, "headcount"), 1),
    status: str(pick(row, "status")) as HrRequisition["status"],
    hiringManagerEmployeeId: strOrNull(pick(row, "hiringManagerEmployeeId")),
    openedOn: strOrNull(pick(row, "openedOn")),
    targetStartDate: strOrNull(pick(row, "targetStartDate")),
    updatedAt: str(pick(row, "updatedAt")),
  };
}

function mapApplication(raw: unknown): HrApplication {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    requisitionId: str(pick(row, "requisitionId")),
    applicationNumber: str(pick(row, "applicationNumber")),
    candidateFirstName: str(pick(row, "candidateFirstName")),
    candidateLastName: str(pick(row, "candidateLastName")),
    candidateEmail: strOrNull(pick(row, "candidateEmail")),
    candidatePhone: strOrNull(pick(row, "candidatePhone")),
    source: strOrNull(pick(row, "source")),
    status: str(pick(row, "status")) as HrApplication["status"],
    appliedOn: str(pick(row, "appliedOn")),
    convertedEmployeeId: strOrNull(pick(row, "convertedEmployeeId")),
    requisitionTitle: strOrNull(pick(row, "requisitionTitle")),
    updatedAt: str(pick(row, "updatedAt")),
  };
}

export const listHrRequisitions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; status?: string }) => ({
    companyId: companyIdOf(input),
    status: input.status?.trim() || null,
  }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(
      context.supabase,
      "list_hr_requisitions",
      { _company_id: data.companyId, _status: data.status },
      HR04_MIGRATION,
    );
    const items = asUnknownArray(pick(asRecord(raw), "items")).map(mapRequisition);
    return { items };
  });

export const upsertHrRequisition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      payload: {
        id?: string | null;
        title: string;
        status?: string;
        departmentId?: string | null;
        designationId?: string | null;
        locationId?: string | null;
        employmentType?: string;
        headcount?: number;
        description?: string | null;
        targetStartDate?: string | null;
      };
    }) => ({
      companyId: companyIdOf(input),
      payload: input.payload,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.recruitment.manage");
    const raw = await callRpc(
      context.supabase,
      "upsert_hr_requisition",
      { _company_id: data.companyId, _payload: data.payload },
      HR04_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")),
      requisitionNumber: strOrNull(pick(row, "requisitionNumber")),
      status: strOrNull(pick(row, "status")),
    };
  });

export const listHrApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; requisitionId?: string | null; status?: string }) => ({
    companyId: companyIdOf(input),
    requisitionId: input.requisitionId || null,
    status: input.status?.trim() || null,
  }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(
      context.supabase,
      "list_hr_applications",
      {
        _company_id: data.companyId,
        _requisition_id: data.requisitionId,
        _status: data.status,
      },
      HR04_MIGRATION,
    );
    return { items: asUnknownArray(pick(asRecord(raw), "items")).map(mapApplication) };
  });

export const upsertHrApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      payload: {
        id?: string | null;
        requisitionId: string;
        candidateFirstName: string;
        candidateLastName: string;
        candidateEmail?: string | null;
        candidatePhone?: string | null;
        source?: string | null;
        status?: string;
        stageNotes?: string | null;
      };
    }) => ({
      companyId: companyIdOf(input),
      payload: input.payload,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.recruitment.manage");
    const raw = await callRpc(
      context.supabase,
      "upsert_hr_application",
      { _company_id: data.companyId, _payload: data.payload },
      HR04_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")),
      applicationNumber: strOrNull(pick(row, "applicationNumber")),
      status: strOrNull(pick(row, "status")),
    };
  });

export const upsertHrInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      payload: {
        id?: string | null;
        applicationId: string;
        scheduledAt: string;
        durationMinutes?: number;
        mode?: string;
        interviewerEmployeeId?: string | null;
        status?: string;
        feedback?: string | null;
        rating?: number | null;
      };
    }) => ({
      companyId: companyIdOf(input),
      payload: input.payload,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.recruitment.manage");
    const raw = await callRpc(
      context.supabase,
      "upsert_hr_interview",
      { _company_id: data.companyId, _payload: data.payload },
      HR04_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")),
      status: strOrNull(pick(row, "status")),
      scheduledAt: strOrNull(pick(row, "scheduledAt")),
    };
  });

export const upsertHrOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      payload: {
        id?: string | null;
        applicationId: string;
        status?: string;
        proposedStartDate?: string | null;
        proposedDesignationId?: string | null;
        proposedDepartmentId?: string | null;
        proposedLocationId?: string | null;
        notes?: string | null;
      };
    }) => ({
      companyId: companyIdOf(input),
      payload: input.payload,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.recruitment.manage");
    const raw = await callRpc(
      context.supabase,
      "upsert_hr_offer",
      { _company_id: data.companyId, _payload: data.payload },
      HR04_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")),
      offerNumber: strOrNull(pick(row, "offerNumber")),
      status: strOrNull(pick(row, "status")),
    };
  });

export const listHrOnboardingTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(
      context.supabase,
      "list_hr_onboarding_templates",
      { _company_id: data.companyId },
      HR04_MIGRATION,
    );
    const templates = asUnknownArray(pick(asRecord(raw), "templates")).map(
      (item): HrOnboardingTemplate => {
        const row = asRecord(item);
        return {
          id: str(pick(row, "id")),
          code: str(pick(row, "code")),
          name: str(pick(row, "name")),
          description: strOrNull(pick(row, "description")),
          isActive: bool(pick(row, "isActive"), true),
          sortOrder: num(pick(row, "sortOrder"), 100),
          taskCount: num(pick(row, "taskCount")),
        };
      },
    );
    return { templates };
  });

export const upsertHrOnboardingTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      payload: {
        id?: string | null;
        code: string;
        name: string;
        description?: string | null;
        isActive?: boolean;
        tasks?: Array<{
          title: string;
          ownerRole?: string;
          dueOffsetDays?: number;
          isRequired?: boolean;
          sortOrder?: number;
        }>;
      };
    }) => ({
      companyId: companyIdOf(input),
      payload: input.payload,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.onboarding.manage");
    const raw = await callRpc(
      context.supabase,
      "upsert_hr_onboarding_template",
      { _company_id: data.companyId, _payload: data.payload },
      HR04_MIGRATION,
    );
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")),
      code: strOrNull(pick(row, "code")),
      name: strOrNull(pick(row, "name")),
    };
  });

export const listHrOnboardingCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; status?: string }) => ({
    companyId: companyIdOf(input),
    status: input.status?.trim() || null,
  }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(
      context.supabase,
      "list_hr_onboarding_cases",
      { _company_id: data.companyId, _status: data.status },
      HR04_MIGRATION,
    );
    const items = asUnknownArray(pick(asRecord(raw), "items")).map(
      (item): HrOnboardingCaseListItem => {
        const row = asRecord(item);
        return {
          id: str(pick(row, "id")),
          caseNumber: str(pick(row, "caseNumber")),
          employeeId: strOrNull(pick(row, "employeeId")),
          applicationId: strOrNull(pick(row, "applicationId")),
          templateId: strOrNull(pick(row, "templateId")),
          status: str(pick(row, "status")) as HrOnboardingCaseListItem["status"],
          startDate: strOrNull(pick(row, "startDate")),
          targetJoinDate: strOrNull(pick(row, "targetJoinDate")),
          completedAt: strOrNull(pick(row, "completedAt")),
          employeeName: strOrNull(pick(row, "employeeName")),
          pendingTasks: num(pick(row, "pendingTasks")),
          updatedAt: str(pick(row, "updatedAt")),
        };
      },
    );
    return { items };
  });

function mapOnboardingCaseDetail(raw: unknown): HrOnboardingCaseDetail {
  const row = asRecord(raw);
  const c = asRecord(pick(row, "case"));
  return {
    case: {
      id: str(pick(c, "id")),
      caseNumber: str(pick(c, "caseNumber")),
      employeeId: strOrNull(pick(c, "employeeId")),
      applicationId: strOrNull(pick(c, "applicationId")),
      templateId: strOrNull(pick(c, "templateId")),
      status: str(pick(c, "status")) as HrOnboardingCaseDetail["case"]["status"],
      startDate: strOrNull(pick(c, "startDate")),
      targetJoinDate: strOrNull(pick(c, "targetJoinDate")),
      completedAt: strOrNull(pick(c, "completedAt")),
      notes: strOrNull(pick(c, "notes")),
      version: num(pick(c, "version"), 1),
    },
    tasks: asUnknownArray(pick(row, "tasks")).map((item) => {
      const t = asRecord(item);
      return {
        id: str(pick(t, "id")),
        title: str(pick(t, "title")),
        ownerRole: str(pick(t, "ownerRole")),
        status: str(pick(t, "status")) as HrOnboardingCaseDetail["tasks"][number]["status"],
        dueOn: strOrNull(pick(t, "dueOn")),
        completedAt: strOrNull(pick(t, "completedAt")),
        isRequired: bool(pick(t, "isRequired"), true),
        sortOrder: num(pick(t, "sortOrder"), 100),
        notes: strOrNull(pick(t, "notes")),
      };
    }),
  };
}

export const getHrOnboardingCase = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; caseId: string }) => ({
    companyId: companyIdOf(input),
    caseId: input.caseId,
  }))
  .handler(async ({ data, context }): Promise<HrOnboardingCaseDetail> => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(
      context.supabase,
      "get_hr_onboarding_case",
      { _company_id: data.companyId, _case_id: data.caseId },
      HR04_MIGRATION,
    );
    return mapOnboardingCaseDetail(raw);
  });

export const createHrOnboardingCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      payload: {
        templateId: string | null;
        employeeId: string | null;
        applicationId: string | null;
        targetJoinDate: string | null;
        notes: string | null;
      };
    }) => ({
      companyId: companyIdOf(input),
      payload: {
        templateId: input.payload.templateId,
        employeeId: input.payload.employeeId,
        applicationId: input.payload.applicationId,
        targetJoinDate: input.payload.targetJoinDate,
        notes: input.payload.notes,
      },
    }),
  )
  .handler(async ({ data, context }): Promise<HrOnboardingCaseDetail> => {
    await requireHr(context.supabase, data.companyId, "hr.onboarding.manage");
    const raw = await callRpc(
      context.supabase,
      "create_hr_onboarding_case",
      { _company_id: data.companyId, _payload: data.payload },
      HR04_MIGRATION,
    );
    return mapOnboardingCaseDetail(raw);
  });

export const updateHrOnboardingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { companyId: string; taskId: string; status: string; notes: string | null }) => ({
      companyId: companyIdOf(input),
      taskId: input.taskId,
      status: input.status,
      notes: input.notes,
    }),
  )
  .handler(async ({ data, context }): Promise<HrOnboardingCaseDetail> => {
    await requireHr(context.supabase, data.companyId, "hr.onboarding.manage");
    const raw = await callRpc(
      context.supabase,
      "update_hr_onboarding_task",
      {
        _company_id: data.companyId,
        _task_id: data.taskId,
        _status: data.status,
        _notes: data.notes,
      },
      HR04_MIGRATION,
    );
    return mapOnboardingCaseDetail(raw);
  });
