import { z } from "zod";
export const automationModule = z.enum(["jobs", "rules", "events"]);
export type AutomationModule = z.infer<typeof automationModule>;
export function parseAutomationSearch(raw: Record<string, unknown>): {
  module: AutomationModule;
  item?: string | undefined;
} {
  return {
    module: automationModule.catch("jobs").parse(raw["module"]),
    item: z.string().uuid().optional().catch(undefined).parse(raw["item"]),
  };
}
export const automationReadSchema = z.object({
  module: z.enum(["jobs", "rules", "events", "runs"]),
  search: z.string().trim().max(160).default(""),
  status: z.string().max(40).default("all"),
  page: z.number().int().min(0).max(100000).default(0),
  id: z.string().uuid().nullable().default(null),
});
const revision = z
  .object({ id: z.string().uuid(), row_version: z.number().int().positive() })
  .strict();
export const jobKinds = ["expire_support", "check_operations"] as const;
export const alertMetrics = [
  "overdue_cases",
  "urgent_cases",
  "open_incidents",
  "failed_jobs",
  "aged_approvals",
] as const;
export const metricLabels: Record<(typeof alertMetrics)[number], string> = {
  overdue_cases: "Open cases past their response deadline",
  urgent_cases: "Open urgent service cases",
  open_incidents: "Open platform incidents",
  failed_jobs: "Operational jobs in dead letter",
  aged_approvals: "Unexpired approvals older than 24 hours",
};
const hour = z.number().int().min(0).max(23).nullable();
export const ruleSchema = z
  .object({
    id: z.string().uuid().nullable(),
    row_version: z.number().int().positive().nullable(),
    name: z.string().trim().min(2).max(80),
    metric: z.enum(alertMetrics),
    severity: z.enum(["info", "warning", "critical"]),
    threshold: z.number().int().min(0).max(2147483647),
    quiet_start_utc: hour,
    quiet_end_utc: hour,
  })
  .strict()
  .refine((v) => !v.id || v.row_version !== null, "Reload this rule before editing")
  .refine(
    (v) =>
      (v.quiet_start_utc === null && v.quiet_end_utc === null) ||
      (v.quiet_start_utc !== null &&
        v.quiet_end_utc !== null &&
        v.quiet_start_utc !== v.quiet_end_utc),
    "Choose two different UTC quiet hours or leave both empty",
  );
export const automationPayloads = {
  "jobs.enqueue": z.object({ kind: z.enum(jobKinds) }).strict(),
  "jobs.retry": revision,
  "jobs.cancel": revision,
  "rules.save": ruleSchema,
  "rules.enable": revision,
  "rules.disable": revision,
  "alerts.ack": z.object({ id: z.string().uuid() }).strict(),
} as const;
export type AutomationCommand = keyof typeof automationPayloads;
export const automationActionSchema = z
  .object({
    command: z.custom<AutomationCommand>(
      (v) => typeof v === "string" && Object.hasOwn(automationPayloads, v),
      "Unknown automation action",
    ),
    payload: z.record(z.string(), z.unknown()),
    reason: z.string().trim().min(3).max(1000),
    requestId: z.string().uuid(),
  })
  .strict()
  .transform((v) => ({ ...v, payload: automationPayloads[v.command].parse(v.payload) }));
export type WorkerState = {
  configured: boolean;
  enabled: boolean;
  state: "unconfigured" | "paused" | "awaiting_first_run" | "stale" | "recent_tick";
  startedAt: string | null;
  finishedAt: string | null;
  lastJobs: number | null;
};
export type AutomationContext = {
  modules: { key: AutomationModule; label: string; canManage: boolean }[];
  worker: WorkerState;
};
export type AutomationRow = {
  id: string;
  name?: string;
  kind?: string | null;
  status?: string;
  state?: string;
  row_version?: number;
  created_at?: string;
  origin?: string;
  attempts?: number;
  max_attempts?: number;
  started_at?: string | null;
  finished_at?: string | null;
  next_run_at?: string;
  last_error?: string | null;
  result?: Record<string, number | string | boolean | null> | null;
  attempt?: number;
  error_code?: string | null;
  metric?: string | null;
  severity?: string;
  enabled?: boolean;
  threshold?: string;
  observed?: string | null;
  observed_at?: string | null;
  quiet_start_utc?: number | null;
  quiet_end_utc?: number | null;
  first_seen_at?: string;
  last_seen_at?: string;
  resolved_at?: string | null;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  quiet_hours?: boolean;
  observations?: number;
  resolution_reason?: string | null;
};
