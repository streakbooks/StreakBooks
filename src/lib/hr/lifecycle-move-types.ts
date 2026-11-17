export const HR_TRANSFER_CHANGE_TYPES = [
  "transfer",
  "promotion",
  "demotion",
  "location_change",
  "manager_change",
  "other",
] as const;
export type HrTransferChangeType = (typeof HR_TRANSFER_CHANGE_TYPES)[number];

export const HR_TRANSFER_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "cancelled",
  "applied",
] as const;
export type HrTransferStatus = (typeof HR_TRANSFER_STATUSES)[number];

export const HR_EXIT_REASONS = [
  "resignation",
  "termination",
  "end_of_contract",
  "retirement",
  "other",
] as const;
export type HrExitReason = (typeof HR_EXIT_REASONS)[number];

export const HR_OFFBOARDING_CASE_STATUSES = [
  "planned",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type HrOffboardingCaseStatus = (typeof HR_OFFBOARDING_CASE_STATUSES)[number];

export const HR_OFFBOARDING_TASK_STATUSES = ["pending", "done", "blocked", "skipped"] as const;
export type HrOffboardingTaskStatus = (typeof HR_OFFBOARDING_TASK_STATUSES)[number];

export type HrTransferRequest = {
  id: string;
  requestNumber: string;
  employeeId: string;
  employeeName: string | null;
  employeeNumber: string | null;
  changeType: string;
  effectiveOn: string;
  status: string;
  toDepartmentId: string | null;
  toDepartmentName: string | null;
  toDesignationId: string | null;
  toDesignationName: string | null;
  toLocationId: string | null;
  toLocationName: string | null;
  toManagerEmployeeId: string | null;
  toManagerName: string | null;
  toWorkArrangement: string | null;
  reason: string | null;
  appliedAt: string | null;
  updatedAt: string;
};

export type HrOffboardingCaseListItem = {
  id: string;
  caseNumber: string;
  employeeId: string;
  employeeName: string | null;
  employeeNumber: string | null;
  status: string;
  exitReason: string;
  lastWorkingDay: string;
  noticeDate: string | null;
  completedAt: string | null;
  readyForPayroll: boolean;
  payrollHandoffNote: string | null;
  pendingTasks: number;
  updatedAt: string;
};

export type HrOffboardingTask = {
  id: string;
  title: string;
  ownerRole: string;
  status: string;
  dueOn: string | null;
  completedAt: string | null;
  isRequired: boolean;
  sortOrder: number;
  notes: string | null;
};

export type HrOffboardingCaseDetail = {
  case: {
    id: string;
    caseNumber: string;
    employeeId: string;
    employeeName: string | null;
    employeeNumber: string | null;
    status: string;
    exitReason: string;
    lastWorkingDay: string;
    noticeDate: string | null;
    completedAt: string | null;
    readyForPayroll: boolean;
    payrollHandoffNote: string | null;
    notes: string | null;
    version: number;
  };
  tasks: HrOffboardingTask[];
};

export const HR10_MIGRATION = "HR transfers/offboarding needs database update 20261109220000.";
