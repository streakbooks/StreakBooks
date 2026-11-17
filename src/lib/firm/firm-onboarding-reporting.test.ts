import { describe, expect, it } from "vitest";
import {
  overdueAgeBand,
  onboardingAgeCounts,
  onboardingOperationalRows,
  onboardingDailyTrends,
  onboardingOperationsCsv,
  onboardingTrendCsv,
} from "./firm-onboarding-reporting";

const steps = [
  {
    company_id: "c1",
    task_key: "first",
    title: "=SUM(A1:A5)",
    due_date: "2026-11-05",
    completed_at: null,
    assignee_id: "staff",
    depends_on_task_key: null,
  },
  {
    company_id: "c1",
    task_key: "second",
    title: "Next, review",
    due_date: "2026-10-28",
    completed_at: null,
    assignee_id: null,
    depends_on_task_key: "first",
  },
  {
    company_id: "c2",
    task_key: "third",
    title: "Final notes",
    due_date: null,
    completed_at: "2026-11-05T12:00:00Z",
    assignee_id: "staff",
    depends_on_task_key: null,
  },
];

const all = {
  companyId: "all",
  assigneeId: "all",
  age: "all" as const,
  includeCompleted: true,
};

describe("onboarding advanced reports", () => {
  it("buckets overdue periods at exact calendar-day boundaries", () => {
    const today = "2026-11-06";
    expect(overdueAgeBand("2026-11-06", null, today).band).toBe("not_due");
    expect(overdueAgeBand("2026-11-05", null, today)).toEqual({ band: "1_7", days: 1 });
    expect(overdueAgeBand("2026-10-30", null, today).band).toBe("1_7");
    expect(overdueAgeBand("2026-10-29", null, today).band).toBe("8_30");
    expect(overdueAgeBand("2026-10-07", null, today).band).toBe("8_30");
    expect(overdueAgeBand("2026-10-06", null, today).band).toBe("31_60");
    expect(overdueAgeBand("2026-09-07", null, today).band).toBe("31_60");
    expect(overdueAgeBand("2026-09-06", null, today).band).toBe("61_plus");
    expect(overdueAgeBand(null, null, today).band).toBe("unscheduled");
    expect(overdueAgeBand("2026-01-01", "2026-02-01", today).band).toBe("completed");
  });
  it("filters by independent company, owner and ageing while retaining dependency context", () => {
    const rows = onboardingOperationalRows(steps, "2026-11-06", all);
    expect(rows.map((r) => r.task_key)).toEqual(["second", "first", "third"]);
    expect(rows.find((r) => r.task_key === "second")?.blocked).toBe(true);
    expect(onboardingAgeCounts(rows)).toMatchObject({
      "1_7": 1,
      "8_30": 1,
      completed: 1,
      unscheduled: 0,
    });
    const filtered = onboardingOperationalRows(steps, "2026-11-06", {
      ...all,
      companyId: "c1",
      assigneeId: "unassigned",
      age: "8_30",
      includeCompleted: false,
    });
    expect(filtered.map((r) => r.task_key)).toEqual(["second"]);
    expect(
      onboardingOperationalRows(steps, "2026-11-06", {
        ...all,
        companyId: "c2",
        includeCompleted: false,
      }),
    ).toEqual([]);
  });
  it("aggregates only observed historical days and authorized clients", () => {
    const source = [
      {
        firm_id: "firm",
        company_id: "c1",
        snapshot_date: "2026-11-04",
        total_steps: 4,
        completed_steps: 2,
        overdue_steps: 1,
        blocked_steps: 0,
        unassigned_open_steps: 1,
      },
      {
        firm_id: "firm",
        company_id: "c2",
        snapshot_date: "2026-11-04",
        total_steps: 6,
        completed_steps: 6,
        overdue_steps: 0,
        blocked_steps: 0,
        unassigned_open_steps: 0,
      },
      {
        firm_id: "firm",
        company_id: "c1",
        snapshot_date: "2026-11-06",
        total_steps: 4,
        completed_steps: 4,
        overdue_steps: 0,
        blocked_steps: 0,
        unassigned_open_steps: 0,
      },
    ];
    const onlyC1 = onboardingDailyTrends(source, new Set(["c1"]));
    expect(onlyC1.map((r) => r.date)).toEqual(["2026-11-04", "2026-11-06"]);
    expect(onlyC1[0]).toMatchObject({
      clientCount: 1,
      completed: 2,
      total: 4,
      completionPercent: 50,
    });
    expect(onboardingDailyTrends(source, new Set(["c3"]))).toEqual([]);
    expect(onboardingDailyTrends([], new Set(["c1"]))).toEqual([]);
  });
  it("quotes and neutralizes task and client names before CSV consumption", () => {
    const report = onboardingOperationalRows(steps, "2026-11-06", all);
    const csv = onboardingOperationsCsv(
      report,
      new Map([
        ["c1", " +SUM(1,1)"],
        ["c2", "Friendly client"],
      ]),
      new Map([["staff", "@danger"]]),
    );
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"\'=SUM(A1:A5)"');
    expect(csv).toContain('"\' +SUM(1,1)"');
    expect(csv).toContain('"\'@danger"');
    expect(csv).toContain('"Next, review"');
    expect(csv.split("\r\n").length).toBe(steps.length + 1);
  });
  it("exports a historical table without invented dates", () => {
    const days = onboardingDailyTrends(
      [
        {
          firm_id: "firm",
          company_id: "c1",
          snapshot_date: "2026-11-04",
          total_steps: 10,
          completed_steps: 7,
          overdue_steps: 1,
          blocked_steps: 0,
          unassigned_open_steps: 2,
        },
      ],
      new Set(["c1"]),
    );
    const csv = onboardingTrendCsv(days);
    expect(csv).toContain("2026-11-04");
    expect(csv).not.toContain("2026-11-05");
    expect(csv.split("\r\n")).toHaveLength(2);
  });
});
