export type HrSelfContext = {
  linked: boolean;
  message: string | null;
  employee: {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    email: string | null;
    status: string;
    hireDate: string | null;
  } | null;
  profile: {
    preferredName: string | null;
    personalEmail: string | null;
    personalPhone: string | null;
    workPhone: string | null;
    managerEmployeeId: string | null;
    departmentId: string | null;
    designationId: string | null;
    locationId: string | null;
    workArrangement: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    emergencyContactRelation: string | null;
  } | null;
};

export type HrSelfLeaveRequest = {
  id: string;
  requestNumber: string;
  leaveTypeId: string;
  leaveTypeCode: string | null;
  leaveTypeName: string | null;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  reason: string | null;
  updatedAt: string;
};

export type HrSelfAttendance = {
  id: string;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  source: string;
  status: string;
  notes: string | null;
};

export type HrManagerTeamMember = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  status: string;
  departmentName: string | null;
  designationName: string | null;
};

export type HrApprovalItem = {
  id: string;
  kind: "leave" | "attendance_correction" | string;
  requestNumber?: string | null;
  employeeId: string;
  employeeName: string | null;
  summary: string;
  status: string;
  updatedAt: string;
};

export const HR07_MIGRATION = "HR ESS/manager/approvals needs database update 20261109194000.";
