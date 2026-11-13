export const HR_REQUISITION_STATUSES = ["draft", "open", "filled", "cancelled"] as const;
export type HrRequisitionStatus = (typeof HR_REQUISITION_STATUSES)[number];

export const HR_APPLICATION_STATUSES = [
  "applied",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
] as const;
export type HrApplicationStatus = (typeof HR_APPLICATION_STATUSES)[number];

export const HR_OFFER_STATUSES = [
  "draft",
  "extended",
  "accepted",
  "declined",
  "expired",
  "withdrawn",
] as const;
export type HrOfferStatus = (typeof HR_OFFER_STATUSES)[number];

export const HR_ONBOARDING_CASE_STATUSES = [
  "planned",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type HrOnboardingCaseStatus = (typeof HR_ONBOARDING_CASE_STATUSES)[number];

export const HR_ONBOARDING_TASK_STATUSES = ["pending", "done", "blocked", "skipped"] as const;
export type HrOnboardingTaskStatus = (typeof HR_ONBOARDING_TASK_STATUSES)[number];

export type HrRequisition = {
  id: string;
  requisitionNumber: string;
  title: string;
  departmentId: string | null;
  designationId: string | null;
  locationId: string | null;
  employmentType: string;
  headcount: number;
  status: HrRequisitionStatus;
  hiringManagerEmployeeId: string | null;
  openedOn: string | null;
  targetStartDate: string | null;
  updatedAt: string;
};

export type HrApplication = {
  id: string;
  requisitionId: string;
  applicationNumber: string;
  candidateFirstName: string;
  candidateLastName: string;
  candidateEmail: string | null;
  candidatePhone: string | null;
  source: string | null;
  status: HrApplicationStatus;
  appliedOn: string;
  convertedEmployeeId: string | null;
  requisitionTitle: string | null;
  updatedAt: string;
};

export type HrOnboardingTemplate = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  taskCount: number;
};

export type HrOnboardingCaseListItem = {
  id: string;
  caseNumber: string;
  employeeId: string | null;
  applicationId: string | null;
  templateId: string | null;
  status: HrOnboardingCaseStatus;
  startDate: string | null;
  targetJoinDate: string | null;
  completedAt: string | null;
  employeeName: string | null;
  pendingTasks: number;
  updatedAt: string;
};

export type HrOnboardingTask = {
  id: string;
  title: string;
  ownerRole: string;
  status: HrOnboardingTaskStatus;
  dueOn: string | null;
  completedAt: string | null;
  isRequired: boolean;
  sortOrder: number;
  notes: string | null;
};

export type HrOnboardingCaseDetail = {
  case: {
    id: string;
    caseNumber: string;
    employeeId: string | null;
    applicationId: string | null;
    templateId: string | null;
    status: HrOnboardingCaseStatus;
    startDate: string | null;
    targetJoinDate: string | null;
    completedAt: string | null;
    notes: string | null;
    version: number;
  };
  tasks: HrOnboardingTask[];
};

export const HR04_MIGRATION =
  "HR recruitment/onboarding needs database update 20261109191000.";
