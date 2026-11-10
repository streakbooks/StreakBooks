import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc, companyIdOf } from "@/lib/planning/rpc";
import type { Permission } from "@/lib/permissions";
import {
  HR08_MIGRATION,
  type HrAssetAssignment,
  type HrAssetType,
  type HrCase,
  type HrEmployeeDocument,
} from "@/lib/hr/people-types";

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

function mapDoc(raw: unknown): HrEmployeeDocument {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    employeeId: str(pick(row, "employeeId")),
    employeeName: strOrNull(pick(row, "employeeName")),
    employeeNumber: strOrNull(pick(row, "employeeNumber")),
    documentType: str(pick(row, "documentType")) as HrEmployeeDocument["documentType"],
    title: str(pick(row, "title")),
    documentNumber: strOrNull(pick(row, "documentNumber")),
    issuedOn: strOrNull(pick(row, "issuedOn")),
    expiresOn: strOrNull(pick(row, "expiresOn")),
    status: str(pick(row, "status")) as HrEmployeeDocument["status"],
    storagePath: strOrNull(pick(row, "storagePath")),
    notes: strOrNull(pick(row, "notes")),
    updatedAt: str(pick(row, "updatedAt")),
  };
}
function mapAssetType(raw: unknown): HrAssetType {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    code: str(pick(row, "code")),
    name: str(pick(row, "name")),
    isActive: bool(pick(row, "isActive"), true),
    sortOrder: num(pick(row, "sortOrder"), 100),
  };
}
function mapAsset(raw: unknown): HrAssetAssignment {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    employeeId: str(pick(row, "employeeId")),
    employeeName: strOrNull(pick(row, "employeeName")),
    employeeNumber: strOrNull(pick(row, "employeeNumber")),
    assetTypeId: str(pick(row, "assetTypeId")),
    assetTypeCode: strOrNull(pick(row, "assetTypeCode")),
    assetTypeName: strOrNull(pick(row, "assetTypeName")),
    assetTag: str(pick(row, "assetTag")),
    description: strOrNull(pick(row, "description")),
    conditionOnIssue: str(pick(row, "conditionOnIssue")),
    conditionOnReturn: strOrNull(pick(row, "conditionOnReturn")),
    status: str(pick(row, "status")) as HrAssetAssignment["status"],
    assignedOn: str(pick(row, "assignedOn")),
    returnedOn: strOrNull(pick(row, "returnedOn")),
    notes: strOrNull(pick(row, "notes")),
    updatedAt: str(pick(row, "updatedAt")),
  };
}
function mapCase(raw: unknown): HrCase {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    caseNumber: str(pick(row, "caseNumber")),
    employeeId: str(pick(row, "employeeId")),
    employeeName: strOrNull(pick(row, "employeeName")),
    employeeNumber: strOrNull(pick(row, "employeeNumber")),
    caseType: str(pick(row, "caseType")),
    title: str(pick(row, "title")),
    status: str(pick(row, "status")),
    severity: str(pick(row, "severity")),
    openedOn: str(pick(row, "openedOn")),
    closedOn: strOrNull(pick(row, "closedOn")),
    summary: strOrNull(pick(row, "summary")),
    updatedAt: str(pick(row, "updatedAt")),
  };
}

export const listHrEmployeeDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; employeeId?: string | null; status?: string | null }) => ({
    companyId: companyIdOf(input),
    employeeId: input.employeeId?.trim() || null,
    status: input.status?.trim() || null,
  }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(context.supabase, "list_hr_employee_documents", {
      _company_id: data.companyId, _employee_id: data.employeeId, _status: data.status,
    }, HR08_MIGRATION);
    const row = asRecord(raw);
    return {
      items: asUnknownArray(pick(row, "items")).map(mapDoc),
      expiringSoon: num(pick(row, "expiringSoon")),
    };
  });

export const upsertHrEmployeeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string;
    payload: {
      id?: string | null; employeeId: string; documentType: string; title: string;
      documentNumber: string | null; issuedOn: string | null; expiresOn: string | null;
      status: string; storagePath: string | null; notes: string | null;
    };
  }) => ({ companyId: companyIdOf(input), payload: input.payload }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.employees.manage");
    const raw = await callRpc(context.supabase, "upsert_hr_employee_document", {
      _company_id: data.companyId, _payload: data.payload,
    }, HR08_MIGRATION);
    const row = asRecord(raw);
    return { id: str(pick(row, "id")), title: str(pick(row, "title")), status: str(pick(row, "status")) };
  });

export const listHrAssetTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(context.supabase, "list_hr_asset_types", { _company_id: data.companyId }, HR08_MIGRATION);
    return { items: asUnknownArray(pick(asRecord(raw), "items")).map(mapAssetType) };
  });

export const upsertHrAssetType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string;
    payload: { id?: string | null; code: string; name: string; isActive: boolean; sortOrder: number };
  }) => ({ companyId: companyIdOf(input), payload: input.payload }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.employees.manage");
    const raw = await callRpc(context.supabase, "upsert_hr_asset_type", {
      _company_id: data.companyId, _payload: data.payload,
    }, HR08_MIGRATION);
    const row = asRecord(raw);
    return { id: str(pick(row, "id")), code: str(pick(row, "code")), name: str(pick(row, "name")) };
  });

export const listHrAssetAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; status?: string | null }) => ({
    companyId: companyIdOf(input), status: input.status?.trim() || null,
  }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(context.supabase, "list_hr_asset_assignments", {
      _company_id: data.companyId, _status: data.status,
    }, HR08_MIGRATION);
    return { items: asUnknownArray(pick(asRecord(raw), "items")).map(mapAsset) };
  });

export const upsertHrAssetAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string;
    payload: {
      id?: string | null; employeeId: string; assetTypeId: string; assetTag: string;
      description: string | null; conditionOnIssue: string; conditionOnReturn: string | null;
      status: string; assignedOn: string; returnedOn: string | null; notes: string | null;
    };
  }) => ({ companyId: companyIdOf(input), payload: input.payload }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.employees.manage");
    const raw = await callRpc(context.supabase, "upsert_hr_asset_assignment", {
      _company_id: data.companyId, _payload: data.payload,
    }, HR08_MIGRATION);
    const row = asRecord(raw);
    return { id: str(pick(row, "id")), assetTag: str(pick(row, "assetTag")), status: str(pick(row, "status")) };
  });

export const listHrCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; status?: string | null }) => ({
    companyId: companyIdOf(input), status: input.status?.trim() || null,
  }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.view");
    const raw = await callRpc(context.supabase, "list_hr_cases", {
      _company_id: data.companyId, _status: data.status,
    }, HR08_MIGRATION);
    return { items: asUnknownArray(pick(asRecord(raw), "items")).map(mapCase) };
  });

export const upsertHrCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string;
    payload: {
      id?: string | null; employeeId: string; caseType: string; title: string;
      status: string; severity: string; openedOn: string | null;
      summary: string | null; resolutionNotes: string | null;
    };
  }) => ({ companyId: companyIdOf(input), payload: input.payload }))
  .handler(async ({ data, context }) => {
    await requireHr(context.supabase, data.companyId, "hr.cases.manage");
    const raw = await callRpc(context.supabase, "upsert_hr_case", {
      _company_id: data.companyId, _payload: data.payload,
    }, HR08_MIGRATION);
    const row = asRecord(raw);
    return { id: str(pick(row, "id")), caseNumber: str(pick(row, "caseNumber")), status: str(pick(row, "status")) };
  });