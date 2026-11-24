export const HR_WORK_ARRANGEMENTS = ["onsite", "hybrid", "remote", "field", "other"] as const;
export type HrWorkArrangement = (typeof HR_WORK_ARRANGEMENTS)[number];

export type HrSettings = {
  companyId: string;
  enabled: boolean;
  defaultTimezone: string;
  weekStartsOn: number;
  requireManagerForLeave: boolean;
  disclaimerAcknowledged: boolean;
  version: number;
  updatedAt: string | null;
  disclaimer: string;
};

export type HrDashboardKpis = {
  enabled: boolean;
  activeEmployees: number;
  archivedEmployees: number;
  terminatedEmployees: number;
  profilesLinked: number;
  departments: number;
  locations: number;
  pendingApprovals: number;
  attendanceExceptions: number;
  expiringDocuments: number;
  payrollHandoffsPending: number;
};

export type HrEmployeeListItem = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  status: string;
  hireDate: string;
  payrollDepartment: string | null;
  payrollDesignation: string | null;
  payrollWorkLocation: string | null;
  employmentType: string;
  preferredName: string | null;
  managerEmployeeId: string | null;
  departmentId: string | null;
  designationId: string | null;
  locationId: string | null;
  workArrangement: string | null;
  departmentName: string | null;
  designationName: string | null;
  locationName: string | null;
};

export type HrEmployeeProfile = {
  preferredName: string | null;
  legalMiddleName: string | null;
  personalEmail: string | null;
  personalPhone: string | null;
  workPhone: string | null;
  managerEmployeeId: string | null;
  departmentId: string | null;
  designationId: string | null;
  locationId: string | null;
  branchId: string | null;
  workArrangement: HrWorkArrangement;
  probationEndDate: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  linkedUserId: string | null;
  notes: string | null;
  version: number;
};

export type HrEmployeeDetail = {
  employee: {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    email: string | null;
    status: string;
    hireDate: string;
    terminationDate: string | null;
    employmentType: string;
    payrollDepartment: string | null;
    payrollDesignation: string | null;
    payrollWorkLocation: string | null;
    payrollCountryCode: string;
    payrollCurrency: string;
  };
  profile: HrEmployeeProfile | null;
  positionHistory: Array<{
    id: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    changeType: string;
    departmentId: string | null;
    designationId: string | null;
    locationId: string | null;
    managerEmployeeId: string | null;
    reason: string | null;
  }>;
};

export type HrLocation = {
  id: string;
  code: string;
  name: string;
  timezone: string;
  countryCode: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type HrBranch = {
  id: string;
  locationId: string | null;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

export type HrDepartment = {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  costCentre: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type HrDesignation = {
  id: string;
  code: string;
  name: string;
  gradeCode: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type HrOrgUnits = {
  locations: HrLocation[];
  branches: HrBranch[];
  departments: HrDepartment[];
  designations: HrDesignation[];
};

export type HrAuditEvent = {
  id: string;
  actorUserId: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  summary: string;
  createdAt: string;
};

export const HR_DISCLAIMER =
  "StreakBooks HR Management supports configurable workforce processes. It is not advertised as legally compliant employment-law software for every jurisdiction until rule packs are verified.";
