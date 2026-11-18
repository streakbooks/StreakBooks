export type HrPerformanceCycle = {
  id: string;
  code: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: string;
};
export type HrPerformanceGoal = {
  id: string;
  cycleId: string;
  employeeId: string;
  employeeName: string | null;
  title: string;
  status: string;
  targetValue: number | null;
  currentValue: number | null;
  weightPercent: number;
  dueOn: string | null;
};
export type HrTrainingCourse = {
  id: string;
  code: string;
  name: string;
  provider: string | null;
  isActive: boolean;
};
export type HrTrainingEnrollment = {
  id: string;
  courseId: string;
  courseCode: string | null;
  courseName: string | null;
  employeeId: string;
  employeeName: string | null;
  status: string;
  enrolledOn: string;
  completedOn: string | null;
  certificateName: string | null;
};
export type HrCompensationChange = {
  id: string;
  employeeId: string;
  employeeName: string | null;
  employeeNumber: string | null;
  effectiveOn: string;
  changeType: string;
  currencyCode: string;
  proposedAmount: number;
  status: string;
  notes: string | null;
  payrollHandoffNote: string | null;
  updatedAt: string;
};
export const HR09_MIGRATION = "HR talent needs database update 20261109210000.";
