import { z } from "zod";

export const sections = [
  ["overview", "Overview", "Executive metrics from platform records"],
  ["businesses", "Businesses", "Lifecycle, ownership and storage controls"],
  ["firms", "Accounting firms", "Practices and assigned team members"],
  ["users", "Users", "Account access, MFA requirements and sessions"],
  ["roles", "Roles and permissions", "Scoped custom roles and assignments"],
  ["subscriptions", "Subscriptions", "Verified subscription state"],
  ["billing", "Billing and payments", "Provider events and the existing billing console"],
  [
    "accounting",
    "Accounting configuration",
    "Country-specific defaults; existing company settings stay independent",
  ],
  [
    "features",
    "Feature management",
    "Server-enforced module write controls; historical records remain readable",
  ],
  ["integrations", "Integrations", "Integration registry; connection state is verified separately"],
  ["api", "API management", "API policy registry"],
  ["monitoring", "System monitoring", "Measured database and document storage health"],
  ["audit", "Security and audit logs", "Append-only administrative history"],
  ["support", "Support", "Tickets and separately authorized journal diagnostics"],
  ["notifications", "Notifications", "In-app announcements and notification drafts"],
  ["settings", "System settings", "Maintenance mode and retention policy"],
  ["approvals", "Approvals", "High-risk requests that need a second person"],
] as const;
export type Section = (typeof sections)[number][0];
export const sectionSchema = z.enum(sections.map((s) => s[0]) as [Section, ...Section[]]);
export const listSchema = z.object({
  resource: z.union([sectionSchema, z.literal("assignments"), z.literal("grants")]),
  search: z.string().max(160).default(""),
  page: z.number().int().min(0).max(100000).default(0),
  sort: z.enum(["asc", "desc"]).default("desc"),
});
export const mutationSchema = z.object({
  action: z.enum([
    "business.create",
    "business.update",
    "user.update",
    "user.revoke",
    "role.save",
    "role.assign",
    "role.revoke",
    "member.assign",
    "firm.save",
    "firm.member",
    "support.grant",
    "support.revoke",
    "record.save",
  ]),
  id: z.string().uuid().nullable().default(null),
  payload: z.record(z.unknown()).default({}),
  reason: z.string().trim().min(3).max(1000),
});
export const overviewSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((v) => v.from <= v.to, "End date must follow start date");
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type Row = { [key: string]: JsonValue };
export type PlatformContext = { role: string; permissions: string[]; userId: string };
export type ListResult = { rows: Row[]; total: number; pageSize: number };
export type Overview = {
  businesses: number;
  activeBusinesses: number;
  inactiveBusinesses: number;
  suspendedBusinesses: number;
  trialAccounts: number;
  users: number;
  activeUsers: number;
  firms: number;
  subscriptions: number;
  cancellations: number;
  pastDue: number;
  revenue: { currency: string; mrr_minor: number; arr_minor: number }[];
  /** Present after the entitlement migration. Missing means the server did not separate empty from forbidden. */
  revenueState?: "ok" | "empty" | "forbidden";
  registrations: { day: string; businesses: number }[];
  plans: { plan_code: string; subscriptions: number }[];
  measuredAt: string;
};

export function visibleSections(permissions: readonly string[]) {
  return sections.filter(([id]) => permissions.includes(`${id}.view`));
}
export function csvCell(value: unknown): string {
  const text =
    typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");
  const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function rowsCsv(rows: Row[]): string {
  const columns = [...new Set(rows.flatMap(Object.keys))];
  return [
    columns.map(csvCell).join(","),
    ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(",")),
  ].join("\r\n");
}
export const recordFields: Record<string, readonly string[]> = {
  accounting: [
    "country",
    "currency",
    "timezone",
    "basis",
    "precision",
    "year_end_month",
    "date_format",
  ],
  features: ["description"],
  integrations: ["provider", "category", "notes"],
  api: ["requests_per_minute", "description"],
  support: ["description", "priority", "assignee"],
  notifications: ["message", "starts_at", "ends_at"],
  settings: ["description", "retention_days"],
};
export const moduleNames = [
  "accounting",
  "sales",
  "purchases",
  "banking",
  "budgets",
  "fixed_assets",
  "documents",
  "projects",
];
