export const HR_REPORT_IDS = [
  "headcount_by_department",
  "leave_usage",
  "attendance_exceptions",
  "document_expiry",
  "turnover",
] as const;
export type HrReportId = (typeof HR_REPORT_IDS)[number];

export const HR_REPORT_LABELS: Record<HrReportId, string> = {
  headcount_by_department: "Headcount by department",
  leave_usage: "Leave usage",
  attendance_exceptions: "Attendance exceptions",
  document_expiry: "Document expiry",
  turnover: "Turnover / movement",
};

export type HrReportColumn = { key: string; label: string };
export type HrReportResult = {
  reportId: string;
  dateFrom: string;
  dateTo: string;
  columns: HrReportColumn[];
  rows: Record<string, string | number | null>[];
};

export const HR_AUTOMATION_TRIGGERS = [
  "document_expiry_reminder",
  "pending_approval_digest",
  "payroll_handoff_digest",
] as const;
export type HrAutomationTrigger = (typeof HR_AUTOMATION_TRIGGERS)[number];

import type { Json } from "@/integrations/supabase/types";

export type HrAutomationRule = {
  id: string;
  code: string;
  name: string;
  triggerKind: string;
  isEnabled: boolean;
  config: Json;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunSummary: string | null;
  updatedAt: string;
};

export type HrAutomationRun = {
  id: string;
  ruleId: string;
  status: string;
  summary: string;
  startedAt: string;
  finishedAt: string;
};

export type HrEmployeeExportRow = {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  status: string;
  hireDate: string;
  terminationDate: string | null;
  department: string | null;
  designation: string | null;
  location: string | null;
  managerEmployeeNumber: string | null;
  workArrangement: string | null;
};

export type HrImportPreview = {
  dryRun: true;
  accepted: number;
  warnings: number;
  errors: number;
  issues: Array<{ row: number; level: string; message: string }>;
  note: string;
};

export const HR12_MIGRATION = "HR reports/automations need database update 20261109240000.";