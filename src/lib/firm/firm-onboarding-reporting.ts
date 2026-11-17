import { csvField } from "./client-portfolio";
import type { FirmOnboardingOverviewRow } from "./firm-workflows.functions";
import type { FirmOnboardingDailySnapshot } from "./firm-onboarding-trends.functions";
import { onboardingBlocked } from "./onboarding-insights";

export const ONBOARDING_AGE_FILTERS = [
  "all",
  "not_due",
  "1_7",
  "8_30",
  "31_60",
  "61_plus",
  "unscheduled",
] as const;
export type OnboardingAgeFilter = (typeof ONBOARDING_AGE_FILTERS)[number];

export type OnboardingReportFilters = {
  companyId: string;
  assigneeId: string;
  age: OnboardingAgeFilter;
  includeCompleted: boolean;
};

export type OnboardingOperationalRow = FirmOnboardingOverviewRow & {
  ageBand: Exclude<OnboardingAgeFilter, "all"> | "completed";
  daysOverdue: number;
  blocked: boolean;
};

function dayDiff(from: string, to: string): number {
  const fromDate = Date.parse(from + "T00:00:00Z");
  const toDate = Date.parse(to + "T00:00:00Z");
  return Math.round((toDate - fromDate) / 86400000);
}

export function overdueAgeBand(
  due: string | null,
  completed: string | null,
  today: string,
): { band: OnboardingOperationalRow["ageBand"]; days: number } {
  if (completed) return { band: "completed", days: 0 };
  if (!due) return { band: "unscheduled", days: 0 };
  const days = dayDiff(due, today);
  if (days <= 0) return { band: "not_due", days: 0 };
  if (days <= 7) return { band: "1_7", days };
  if (days <= 30) return { band: "8_30", days };
  if (days <= 60) return { band: "31_60", days };
  return { band: "61_plus", days };
}

export function onboardingOperationalRows(
  rows: FirmOnboardingOverviewRow[],
  today: string,
  filters: OnboardingReportFilters,
): OnboardingOperationalRow[] {
  const groups = new Map<string, FirmOnboardingOverviewRow[]>();
  for (const row of rows) {
    const company = groups.get(row.company_id) ?? [];
    company.push(row);
    groups.set(row.company_id, company);
  }
  return rows
    .map((row) => {
      const age = overdueAgeBand(row.due_date, row.completed_at, today);
      return {
        ...row,
        ageBand: age.band,
        daysOverdue: age.days,
        blocked: onboardingBlocked(row, groups.get(row.company_id) ?? []),
      };
    })
    .filter(
      (row) =>
        (filters.companyId === "all" || row.company_id === filters.companyId) &&
        (filters.assigneeId === "all" ||
          (filters.assigneeId === "unassigned"
            ? !row.assignee_id
            : row.assignee_id === filters.assigneeId)) &&
        (filters.includeCompleted || !row.completed_at) &&
        (filters.age === "all" || row.ageBand === filters.age),
    )
    .sort(
      (a, b) =>
        b.daysOverdue - a.daysOverdue ||
        (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31") ||
        a.company_id.localeCompare(b.company_id) ||
        a.task_key.localeCompare(b.task_key),
    );
}

export type OnboardingAgeCounts = {
  not_due: number;
  "1_7": number;
  "8_30": number;
  "31_60": number;
  "61_plus": number;
  unscheduled: number;
  completed: number;
};
export function onboardingAgeCounts(rows: OnboardingOperationalRow[]): OnboardingAgeCounts {
  const counts: OnboardingAgeCounts = {
    not_due: 0,
    "1_7": 0,
    "8_30": 0,
    "31_60": 0,
    "61_plus": 0,
    unscheduled: 0,
    completed: 0,
  };
  for (const row of rows) counts[row.ageBand]++;
  return counts;
}

export type OnboardingDailyTrend = {
  date: string;
  clientCount: number;
  total: number;
  completed: number;
  overdue: number;
  blocked: number;
  unassigned: number;
  completionPercent: number;
};

export function onboardingDailyTrends(
  rows: FirmOnboardingDailySnapshot[],
  visibleCompanyIds: Set<string>,
): OnboardingDailyTrend[] {
  const byDate = new Map<string, OnboardingDailyTrend>();
  for (const row of rows) {
    if (!visibleCompanyIds.has(row.company_id)) continue;
    let day = byDate.get(row.snapshot_date);
    if (!day) {
      day = {
        date: row.snapshot_date,
        clientCount: 0,
        total: 0,
        completed: 0,
        overdue: 0,
        blocked: 0,
        unassigned: 0,
        completionPercent: 0,
      };
      byDate.set(row.snapshot_date, day);
    }
    day.clientCount++;
    day.total += row.total_steps;
    day.completed += row.completed_steps;
    day.overdue += row.overdue_steps;
    day.blocked += row.blocked_steps;
    day.unassigned += row.unassigned_open_steps;
  }
  return [...byDate.values()]
    .map((row) => ({
      ...row,
      completionPercent: row.total ? Math.round((row.completed / row.total) * 100) : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function onboardingOperationsCsv(
  rows: OnboardingOperationalRow[],
  clientNames: ReadonlyMap<string, string>,
  staffNames: ReadonlyMap<string, string>,
): string {
  const headers = [
    "Client",
    "Task",
    "Task key",
    "Assigned staff",
    "Due date",
    "Status",
    "Days overdue",
    "Age band",
    "Blocked",
    "Completed on",
  ];
  const lines = rows.map((row) =>
    [
      clientNames.get(row.company_id) ?? "Authorized client",
      row.title,
      row.task_key,
      row.assignee_id ? (staffNames.get(row.assignee_id) ?? "Assigned colleague") : "Unassigned",
      row.due_date ?? "",
      row.completed_at ? "Completed" : row.daysOverdue > 0 ? "Overdue" : "Open",
      String(row.daysOverdue),
      row.ageBand,
      row.blocked ? "Yes" : "No",
      row.completed_at ?? "",
    ]
      .map(csvField)
      .join(","),
  );
  return "\uFEFF" + [headers.map(csvField).join(","), ...lines].join("\r\n");
}

export function onboardingTrendCsv(trends: OnboardingDailyTrend[]): string {
  const headers = [
    "Snapshot date (UTC)",
    "Clients observed",
    "Total steps",
    "Completed steps",
    "Completion percent",
    "Overdue steps",
    "Blocked steps",
    "Unassigned open steps",
  ];
  const lines = trends.map((day) =>
    [
      day.date,
      day.clientCount,
      day.total,
      day.completed,
      day.completionPercent,
      day.overdue,
      day.blocked,
      day.unassigned,
    ]
      .map((v) => csvField(String(v)))
      .join(","),
  );
  return "\uFEFF" + [headers.map(csvField).join(","), ...lines].join("\r\n");
}
