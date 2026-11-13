export const HR_ATTENDANCE_STATUSES = ["open", "complete", "exception", "cancelled"] as const;
export type HrAttendanceStatus = (typeof HR_ATTENDANCE_STATUSES)[number];

export const HR_ATTENDANCE_CORRECTION_STATUSES = [
  "submitted",
  "approved",
  "rejected",
  "cancelled",
] as const;
export type HrAttendanceCorrectionStatus = (typeof HR_ATTENDANCE_CORRECTION_STATUSES)[number];

export const HR_LEAVE_REQUEST_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "cancelled",
] as const;
export type HrLeaveRequestStatus = (typeof HR_LEAVE_REQUEST_STATUSES)[number];

export const HR_LEAVE_ACCRUAL_METHODS = ["annual", "monthly", "none"] as const;
export type HrLeaveAccrualMethod = (typeof HR_LEAVE_ACCRUAL_METHODS)[number];

export type HrShiftTemplate = {
  id: string;
  code: string;
  name: string;
  timezone: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  weeklyOffMask: number;
  isActive: boolean;
  sortOrder: number;
  notes: string | null;
  updatedAt: string;
};

export type HrShiftAssignment = {
  id: string;
  employeeId: string;
  employeeName: string | null;
  employeeNumber: string | null;
  shiftTemplateId: string;
  shiftCode: string | null;
  shiftName: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  updatedAt: string;
};

export type HrAttendanceLog = {
  id: string;
  employeeId: string;
  employeeName: string | null;
  employeeNumber: string | null;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  source: string;
  status: HrAttendanceStatus;
  notes: string | null;
  updatedAt: string;
};

export type HrAttendanceCorrection = {
  id: string;
  attendanceLogId: string | null;
  employeeId: string;
  employeeName: string | null;
  employeeNumber: string | null;
  workDate: string;
  requestedCheckInAt: string | null;
  requestedCheckOutAt: string | null;
  reason: string;
  status: HrAttendanceCorrectionStatus;
  decisionNotes: string | null;
  decidedAt: string | null;
  updatedAt: string;
};

export type HrLeaveType = {
  id: string;
  code: string;
  name: string;
  isPaid: boolean;
  requiresApproval: boolean;
  annualAllowanceDays: number;
  accrualMethod: HrLeaveAccrualMethod;
  isActive: boolean;
  sortOrder: number;
  notes: string | null;
  updatedAt: string;
};

export type HrLeaveBalance = {
  id: string;
  employeeId: string;
  employeeName: string | null;
  employeeNumber: string | null;
  leaveTypeId: string;
  leaveTypeCode: string | null;
  leaveTypeName: string | null;
  balanceYear: number;
  entitledDays: number;
  usedDays: number;
  pendingDays: number;
  carriedDays: number;
  availableDays: number;
  updatedAt: string;
};

export type HrLeaveRequest = {
  id: string;
  requestNumber: string;
  employeeId: string;
  employeeName: string | null;
  employeeNumber: string | null;
  leaveTypeId: string;
  leaveTypeCode: string | null;
  leaveTypeName: string | null;
  startDate: string;
  endDate: string;
  days: number;
  status: HrLeaveRequestStatus;
  reason: string | null;
  decisionNotes: string | null;
  decidedAt: string | null;
  updatedAt: string;
};

export type HrHolidayCalendar = {
  id: string;
  code: string;
  name: string;
  locationId: string | null;
  isDefault: boolean;
  isActive: boolean;
  notes: string | null;
  holidayCount: number;
  updatedAt: string;
};

export type HrHoliday = {
  id: string;
  calendarId: string;
  calendarCode: string | null;
  holidayDate: string;
  name: string;
  isOptional: boolean;
  notes: string | null;
  updatedAt: string;
};

export const HR05_MIGRATION =
  "HR attendance/shifts needs database update 20261109192000.";
export const HR06_MIGRATION =
  "HR leave/holidays needs database update 20261109193000.";