import type { FirmOnboardingStep } from "./firm-workflows.functions";

export type OnboardingStepSummary = {
  total: number;
  completed: number;
  open: number;
  overdue: number;
  dueSoon: number;
  blocked: number;
  unassigned: number;
};

type RelevantStep = Pick<
  FirmOnboardingStep,
  "task_key" | "title" | "completed_at" | "due_date" | "assignee_id" | "depends_on_task_key"
>;

export function onboardingBlocked(step: RelevantStep, steps: RelevantStep[]): boolean {
  if (!step.depends_on_task_key || step.completed_at) return false;
  const dependency = steps.find((item) => item.task_key === step.depends_on_task_key);
  return !dependency?.completed_at;
}

export function onboardingCanComplete(step: RelevantStep, steps: RelevantStep[]): boolean {
  return !step.completed_at && !onboardingBlocked(step, steps);
}

export function onboardingCanReopen(step: RelevantStep, steps: RelevantStep[]): boolean {
  return (
    Boolean(step.completed_at) &&
    !steps.some((item) => item.completed_at && item.depends_on_task_key === step.task_key)
  );
}

/** Candidates must not be this step or any of its transitive dependents. */
export function onboardingDependencyChoices<T extends RelevantStep>(
  step: RelevantStep,
  steps: T[],
): T[] {
  function leadsBack(candidateKey: string): boolean {
    const seen = new Set<string>();
    let current: string | null = candidateKey;
    while (current && !seen.has(current)) {
      if (current === step.task_key) return true;
      seen.add(current);
      current = steps.find((item) => item.task_key === current)?.depends_on_task_key ?? null;
    }
    return false;
  }
  return steps.filter(
    (candidate) => candidate.task_key !== step.task_key && !leadsBack(candidate.task_key),
  );
}

export function onboardingStepSummary(steps: RelevantStep[], today: string): OnboardingStepSummary {
  const summary: OnboardingStepSummary = {
    total: steps.length,
    completed: 0,
    open: 0,
    overdue: 0,
    dueSoon: 0,
    blocked: 0,
    unassigned: 0,
  };
  const soon = new Date(today + "T00:00:00Z");
  soon.setUTCDate(soon.getUTCDate() + 3);
  const soonDate = soon.toISOString().slice(0, 10);
  for (const step of steps) {
    if (step.completed_at) {
      summary.completed++;
      continue;
    }
    summary.open++;
    if (!step.assignee_id) summary.unassigned++;
    if (onboardingBlocked(step, steps)) summary.blocked++;
    if (step.due_date && step.due_date < today) summary.overdue++;
    else if (step.due_date && step.due_date <= soonDate) summary.dueSoon++;
  }
  return summary;
}
