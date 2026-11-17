export const HR_DOCUMENT_TYPES = [
  "contract",
  "id",
  "visa",
  "certificate",
  "policy",
  "other",
] as const;
export type HrDocumentType = (typeof HR_DOCUMENT_TYPES)[number];
export const HR_DOCUMENT_STATUSES = ["active", "expired", "superseded", "archived"] as const;
export type HrDocumentStatus = (typeof HR_DOCUMENT_STATUSES)[number];

export const HR_ASSET_STATUSES = ["assigned", "returned", "lost", "written_off"] as const;
export type HrAssetStatus = (typeof HR_ASSET_STATUSES)[number];
export const HR_ASSET_CONDITIONS = ["new", "good", "fair", "poor", "damaged", "lost"] as const;

export const HR_CASE_TYPES = ["grievance", "disciplinary", "investigation", "other"] as const;
export const HR_CASE_STATUSES = ["open", "in_review", "resolved", "closed", "cancelled"] as const;
export const HR_CASE_SEVERITIES = ["low", "medium", "high", "critical"] as const;

export type HrEmployeeDocument = {
  id: string;
  employeeId: string;
  employeeName: string | null;
  employeeNumber: string | null;
  documentType: HrDocumentType;
  title: string;
  documentNumber: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  status: HrDocumentStatus;
  storagePath: string | null;
  notes: string | null;
  updatedAt: string;
};

export type HrAssetType = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

export type HrAssetAssignment = {
  id: string;
  employeeId: string;
  employeeName: string | null;
  employeeNumber: string | null;
  assetTypeId: string;
  assetTypeCode: string | null;
  assetTypeName: string | null;
  assetTag: string;
  description: string | null;
  conditionOnIssue: string;
  conditionOnReturn: string | null;
  status: HrAssetStatus;
  assignedOn: string;
  returnedOn: string | null;
  notes: string | null;
  updatedAt: string;
};

export type HrCase = {
  id: string;
  caseNumber: string;
  employeeId: string;
  employeeName: string | null;
  employeeNumber: string | null;
  caseType: string;
  title: string;
  status: string;
  severity: string;
  openedOn: string;
  closedOn: string | null;
  summary: string | null;
  updatedAt: string;
};

export const HR08_MIGRATION = "HR documents/assets/cases needs database update 20261109200000.";
