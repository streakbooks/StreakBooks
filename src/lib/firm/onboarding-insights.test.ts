import { describe, expect, it } from "vitest";
import {
  onboardingBlocked,
  onboardingCanComplete,
  onboardingCanReopen,
  onboardingDependencyChoices,
  onboardingStepSummary,
} from "./onboarding-insights";

const parent = {
  task_key: "details",
  title: "Company details",
  completed_at: null,
  due_date: "2026-11-04",
  assignee_id: null,
  depends_on_task_key: null,
};
const child = {
  task_key: "records",
  title: "Statutory records",
  completed_at: null,
  due_date: "2026-11-06",
  assignee_id: "staff",
  depends_on_task_key: "details",
};
const final = {
  task_key: "approval",
  title: "Partner approval",
  completed_at: null,
  due_date: "2026-11-12",
  assignee_id: "staff",
  depends_on_task_key: "records",
};

describe("firm onboarding workflow insights", () => {
  it("shows blocked tasks and disallows out-of-order completion", () => {
    const steps = [parent, child, final];
    expect(onboardingBlocked(child, steps)).toBe(true);
    expect(onboardingCanComplete(child, steps)).toBe(false);
    expect(onboardingCanComplete(parent, steps)).toBe(true);
    expect(onboardingCanComplete(child, [{ ...parent, completed_at: "2026-11-05" }, child])).toBe(
      true,
    );
  });
  it("prevents reopening a prerequisite while dependent work is complete", () => {
    const steps = [
      { ...parent, completed_at: "2026-11-05" },
      { ...child, completed_at: "2026-11-05" },
    ];
    expect(onboardingCanReopen(steps[0]!, steps)).toBe(false);
    expect(onboardingCanReopen(steps[1]!, steps)).toBe(true);
  });
  it("excludes self and descendants from prerequisite choices", () => {
    const steps = [parent, child, final];
    expect(onboardingDependencyChoices(parent, steps)).toEqual([]);
    expect(onboardingDependencyChoices(child, steps)).toEqual([parent]);
    expect(onboardingDependencyChoices(final, steps)).toEqual([parent, child]);
  });
  it("counts overdue, due soon, blocked and unassigned only for open tasks", () => {
    const counts = onboardingStepSummary([parent, child, final], "2026-11-06");
    expect(counts).toEqual({
      total: 3,
      completed: 0,
      open: 3,
      overdue: 1,
      dueSoon: 1,
      blocked: 2,
      unassigned: 1,
    });
    expect(
      onboardingStepSummary([{ ...parent, completed_at: "2026-11-05" }], "2026-11-06"),
    ).toMatchObject({ completed: 1, open: 0, overdue: 0, unassigned: 0 });
  });
  it("never treats an unscheduled task as overdue", () => {
    expect(onboardingStepSummary([{ ...parent, due_date: null }], "2026-11-06").overdue).toBe(0);
  });
});
