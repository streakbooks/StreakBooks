import type { FirmOnboardingOverviewRow } from "./firm-workflows.functions";
import { onboardingBlocked } from "./onboarding-insights";

export type StaffWorkload = {
  userId: string;
  assignedOpen: number;
  overdue: number;
  blocked: number;
  dueSoon: number;
  capacity: number;
  utilizationPercent: number;
  overCapacity: boolean;
};

export type OnboardingTask = FirmOnboardingOverviewRow & {
  status: "overdue" | "due_soon" | "blocked" | "unscheduled" | "scheduled";
};

function dueSoonDate(today: string): string {
  const end = new Date(today + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() + 3);
  return end.toISOString().slice(0, 10);
}

function groupedByCompany(steps: FirmOnboardingOverviewRow[]) {
  const groups = new Map<string, FirmOnboardingOverviewRow[]>();
  for (const step of steps) {
    const rows = groups.get(step.company_id) ?? [];
    rows.push(step);
    groups.set(step.company_id, rows);
  }
  return groups;
}

export function staffOnboardingWorkload(
  steps: FirmOnboardingOverviewRow[],
  userId: string,
  maxOpenSteps: number,
  today: string,
): StaffWorkload {
  const companySteps = groupedByCompany(steps);
  const assigned = steps.filter((step) => step.assignee_id === userId && !step.completed_at);
  const soon = dueSoonDate(today);
  const blocked = assigned.filter((step) =>
    onboardingBlocked(step, companySteps.get(step.company_id) ?? []),
  ).length;
  const overdue = assigned.filter((step) => step.due_date && step.due_date < today).length;
  const dueSoon = assigned.filter(
    (step) => step.due_date && step.due_date >= today && step.due_date <= soon,
  ).length;
  return {
    userId,
    assignedOpen: assigned.length,
    overdue,
    blocked,
    dueSoon,
    capacity: maxOpenSteps,
    utilizationPercent: Math.round((assigned.length / maxOpenSteps) * 100),
    overCapacity: assigned.length > maxOpenSteps,
  };
}

export function onboardingTaskQueue(
  steps: FirmOnboardingOverviewRow[],
  userId: string,
  today: string,
): OnboardingTask[] {
  const groups = groupedByCompany(steps);
  const soon = dueSoonDate(today);
  const tasks = steps
    .filter((step) => step.assignee_id === userId && !step.completed_at)
    .map((step): OnboardingTask => {
      const blocked = onboardingBlocked(step, groups.get(step.company_id) ?? []);
      return {
        ...step,
        status: step.due_date && step.due_date < today
          ? "overdue"
          : blocked
            ? "blocked"
            : step.due_date && step.due_date <= soon
              ? "due_soon"
              : step.due_date
                ? "scheduled"
                : "unscheduled",
      };
    });
  const order: Record<OnboardingTask["status"], number> = {
    overdue: 0, due_soon: 1, blocked: 2, scheduled: 3, unscheduled: 4,
  };
  return tasks.sort((a, b) =>
    order[a.status] - order[b.status] ||
    (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31") ||
    a.company_id.localeCompare(b.company_id) ||
    a.task_key.localeCompare(b.task_key),
  );
}

export type FirmCompletionReport = {
  clientCount: number;
  fullyCompletedClients: number;
  completedSteps: number;
  totalSteps: number;
  completionPercent: number;
  overdueSteps: number;
  unassignedOpenSteps: number;
};

export function onboardingCompletionReport(
  steps: FirmOnboardingOverviewRow[],
  today: string,
): FirmCompletionReport {
  const companyRows = groupedByCompany(steps);
  const completedSteps = steps.filter((step) => Boolean(step.completed_at)).length;
  return {
    clientCount: companyRows.size,
    fullyCompletedClients: [...companyRows.values()].filter((rows) =>
      rows.length > 0 && rows.every((row) => Boolean(row.completed_at)),
    ).length,
    completedSteps,
    totalSteps: steps.length,
    completionPercent: steps.length ? Math.round((100 * completedSteps) / steps.length) : 0,
    overdueSteps: steps.filter((step) =>
      !step.completed_at && step.due_date && step.due_date < today,
    ).length,
    unassignedOpenSteps: steps.filter((step) =>
      !step.completed_at && !step.assignee_id,
    ).length,
  };
}
