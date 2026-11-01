import { z } from "zod";

export const TASK_STATUSES = ["todo", "in_progress", "blocked", "ready", "completed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  ready: "Ready for review",
  completed: "Reviewed & complete",
};
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Choose a real calendar date");
export const taskPayload = z
  .object({
    id: z.string().uuid().optional(),
    version: z.number().int().positive().optional(),
    title: z.string().trim().min(2).max(200).optional(),
    kind: z.enum(["deadline", "month_end"]).optional(),
    period_end: isoDate.nullable().optional(),
    due_date: isoDate.optional(),
    assignee_id: z.string().uuid().nullable().optional(),
    note: z.string().max(4000).optional(),
    status: z.enum(TASK_STATUSES).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.id && (!value.title || !value.kind || !value.due_date))
      ctx.addIssue({ code: "custom", message: "Title, kind and due date are required" });
    if (value.id && !value.version)
      ctx.addIssue({ code: "custom", message: "Refresh this task before saving" });
    if (!value.id && value.status && value.status !== "todo")
      ctx.addIssue({ code: "custom", message: "New work starts as To do" });
  });
export type PracticeTask = {
  id: string;
  company_id: string;
  title: string;
  kind: "deadline" | "month_end";
  period_end: string | null;
  due_date: string;
  status: TaskStatus;
  assignee_id: string | null;
  note: string;
  version: number;
  prepared_by: string | null;
  reviewed_by: string | null;
  completed_at: string | null;
  updated_at: string;
};
export type PracticeClient = { id: string; name: string; canManage: boolean };
export type PracticeWorkspace = {
  clients: PracticeClient[];
  tasks: PracticeTask[];
  userId: string;
  hasMore: boolean;
  page: number;
};
const transitions: Record<TaskStatus, readonly TaskStatus[]> = {
  todo: ["in_progress", "blocked"],
  in_progress: ["ready", "blocked"],
  blocked: ["in_progress"],
  ready: ["completed", "in_progress", "blocked"],
  completed: ["in_progress"],
};
export function canTransition(task: PracticeTask, status: TaskStatus, userId: string): boolean {
  return (
    transitions[task.status].includes(status) &&
    (status !== "completed" || (task.prepared_by !== userId && Boolean(task.prepared_by)))
  );
}
export function isOverdue(task: PracticeTask, today: string): boolean {
  return task.status !== "completed" && task.due_date < today;
}
export function monthEnd(value: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error("Choose a valid month");
  const [year, month] = value.split("-").map(Number);
  const day = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  return isoDate.parse(`${value}-${day}`);
}
