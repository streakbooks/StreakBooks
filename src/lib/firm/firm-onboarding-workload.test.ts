import { describe, expect, it } from "vitest";
import {
  onboardingCompletionReport,
  onboardingTaskQueue,
  staffOnboardingWorkload,
} from "./firm-onboarding-workload";

const steps = [
  {
    company_id: "c1", task_key: "intro", title: "Introduce",
    completed_at: "2026-11-01", due_date: "2026-11-01",
    assignee_id: "u1", depends_on_task_key: null,
  },
  {
    company_id: "c1", task_key: "accounts", title: "Review accounts",
    completed_at: null, due_date: "2026-11-02",
    assignee_id: "u1", depends_on_task_key: "intro",
  },
  {
    company_id: "c2", task_key: "setup", title: "Setup",
    completed_at: null, due_date: "2026-11-08",
    assignee_id: "u1", depends_on_task_key: null,
  },
  {
    company_id: "c2", task_key: "review", title: "Review",
    completed_at: null, due_date: null,
    assignee_id: null, depends_on_task_key: "setup",
  },
];

describe("Firm staff onboarding workload", () => {
  it("calculates capacity, overdue and due soon for open assigned tasks only", () => {
    expect(staffOnboardingWorkload(steps, "u1", 1, "2026-11-06")).toMatchObject({
      assignedOpen: 2, overdue: 1, dueSoon: 1, blocked: 0,
      capacity: 1, utilizationPercent: 200, overCapacity: true,
    });
  });
  it("does not leak another staff member's tasks into their queue", () => {
    expect(onboardingTaskQueue(steps, "u2", "2026-11-06")).toEqual([]);
    expect(onboardingTaskQueue(steps, "u1", "2026-11-06")
      .map((step) => step.status)).toEqual(["overdue", "due_soon"]);
  });
  it("marks a blocked task when its own client's prerequisite is incomplete", () => {
    const local = [{ ...steps[1]!, company_id: "c2", depends_on_task_key: "setup" }];
    expect(staffOnboardingWorkload([...steps, ...local], "u1", 5, "2026-11-06").blocked)
      .toBe(1);
  });
  it("produces a scoped completion report without division by zero", () => {
    expect(onboardingCompletionReport(steps, "2026-11-06")).toEqual({
      clientCount: 2, fullyCompletedClients: 0, completedSteps: 1,
      totalSteps: 4, completionPercent: 25, overdueSteps: 1, unassignedOpenSteps: 1,
    });
    expect(onboardingCompletionReport([], "2026-11-06").completionPercent).toBe(0);
  });
});
