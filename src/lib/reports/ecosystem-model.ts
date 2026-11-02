import { z } from "zod";
import { isReportDate } from "./date-validation";
import { PACK_REPORTS } from "./report-document";
export const dateSchema = z.string().refine(isReportDate, "Choose a real calendar date");
export const packConfigSchema = z.object({
  reports: z.array(z.enum(PACK_REPORTS)).min(1).max(20),
  commentary: z.string().max(12000).default(""),
  header: z.string().max(300).default(""),
  footer: z.string().max(300).default(""),
  subtitle: z.string().max(300).default(""),
  actionItems: z
    .array(
      z.object({
        id: z.string().uuid(),
        text: z.string().trim().min(1).max(500),
        assigneeId: z.string().uuid().nullable(),
        status: z.enum(["open", "in_progress", "complete"]),
      }),
    )
    .max(100)
    .default([]),
});
export const packPayloadSchema = z
  .object({
    id: z.string().uuid().optional(),
    version: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(160),
    from: dateSchema,
    to: dateSchema,
    reviewerId: z.string().uuid().nullable().optional(),
    preparerId: z.string().uuid().nullable().optional(),
    config: packConfigSchema,
  })
  .superRefine((v, c) => {
    if (v.from > v.to) c.addIssue({ code: "custom", message: "End date must follow start date" });
    if (v.id && !v.version) c.addIssue({ code: "custom", message: "Refresh before saving" });
  });
export const deliveryPayloadSchema = z
  .object({
    viewId: z.string().uuid().optional(),
    packId: z.string().uuid().optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    recipients: z.array(z.string().email().max(254)).min(1).max(25),
    subject: z.string().trim().min(1).max(200),
    message: z.string().max(10000).default(""),
  })
  .superRefine((v, c) => {
    if (Boolean(v.viewId) === Boolean(v.packId))
      c.addIssue({ code: "custom", message: "Choose one report or pack" });
    if (v.viewId && (!v.from || !v.to || v.from > v.to))
      c.addIssue({ code: "custom", message: "Choose a valid report period" });
  });
export const schedulePayloadSchema = z
  .object({
    id: z.string().uuid().optional(),
    version: z.number().int().positive().optional(),
    viewId: z.string().uuid().optional(),
    packId: z.string().uuid().optional(),
    recipients: z.array(z.string().email().max(254)).min(1).max(25),
    subject: z.string().trim().min(1).max(200),
    message: z.string().max(10000).default(""),
    recurrence: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]),
    period: z.enum([
      "previous_month",
      "previous_quarter",
      "year_to_date",
      "financial_year_to_date",
    ]),
    timezone: z.string().min(1).max(100),
    nextRunAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }).nullable().optional(),
    enabled: z.boolean(),
  })
  .superRefine((v, c) => {
    if (Boolean(v.viewId) === Boolean(v.packId))
      c.addIssue({ code: "custom", message: "Choose one report or pack" });
    if (v.id && !v.version) c.addIssue({ code: "custom", message: "Refresh before saving" });
    if (v.endAt && Date.parse(v.endAt) < Date.parse(v.nextRunAt))
      c.addIssue({ code: "custom", message: "End date precedes the next run" });
  });
export const KPI_IDS = [
  "revenue",
  "gross_profit",
  "net_profit",
  "cash",
  "working_capital",
  "current_ratio",
  "gross_margin",
  "net_margin",
] as const;
export const dashboardSchema = z.object({ widgets: z.array(z.enum(KPI_IDS)).min(1).max(8) });
export const forecastSchema = z
  .object({
    start: dateSchema,
    months: z.number().int().min(1).max(36),
    baselineFrom: dateSchema,
    baselineTo: dateSchema,
    scenarios: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/),
          name: z.string().trim().min(1).max(80),
          revenueGrowthBps: z.number().int().min(-10000).max(100000),
          expenseGrowthBps: z.number().int().min(-10000).max(100000),
          assumptions: z.string().trim().min(1).max(2000),
        }),
      )
      .min(1)
      .max(5),
  })
  .superRefine((v, c) => {
    if (v.baselineFrom > v.baselineTo)
      c.addIssue({ code: "custom", message: "Invalid baseline period" });
    if (v.start.slice(8) !== "01")
      c.addIssue({ code: "custom", message: "Forecast must start on the first of a month" });
    if (v.baselineTo >= v.start)
      c.addIssue({ code: "custom", message: "Baseline must end before projected periods" });
    if (new Set(v.scenarios.map((s) => s.id)).size !== v.scenarios.length)
      c.addIssue({ code: "custom", message: "Scenario identifiers must be unique" });
  });
export type PackConfig = z.infer<typeof packConfigSchema>;
export type PackPayload = z.infer<typeof packPayloadSchema>;
export type ForecastConfig = z.infer<typeof forecastSchema>;
export type ReportingPack = {
  id: string;
  company_id: string;
  owner_id: string;
  name: string;
  from_date: string;
  to_date: string;
  config: PackConfig;
  status: string;
  version: number;
  reviewer_id: string | null;
  preparer_id: string | null;
  prepared_by: string | null;
  approved_by: string | null;
  snapshot: unknown;
  snapshot_hash: string | null;
  created_at: string;
  updated_at: string;
};
export type ReportingMember = { user_id: string; name: string; email: string; role: string };
