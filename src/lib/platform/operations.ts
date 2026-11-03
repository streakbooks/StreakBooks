import { z } from "zod";
export const opsModule = z.enum(["cases", "incidents", "segments", "releases"]);
export type OpsModule = z.infer<typeof opsModule>;
export const opsSearchSchema = z.object({
  module: opsModule.catch("cases"),
  item: z.string().uuid().optional().catch(undefined),
  company: z.string().uuid().optional().catch(undefined),
});
export function parseOpsSearch(raw: Record<string, unknown>): {
  module: OpsModule;
  item?: string | undefined;
  company?: string | undefined;
} {
  const value = opsSearchSchema.parse(raw);
  return { module: value.module, item: value.item, company: value.company };
}
export const opsListSchema = z.object({
  module: opsModule,
  search: z.string().trim().max(160).default(""),
  status: z.string().max(40).default("all"),
  company: z.string().uuid().nullable().default(null),
  page: z.number().int().min(0).max(100000).default(0),
});
export const opsDetailSchema = z.object({ module: opsModule, id: z.string().uuid() });
export const opsLookupSchema = z.object({
  kind: z.enum(["business", "staff"]),
  search: z.string().trim().max(160).default(""),
  page: z.number().int().min(0).max(100000).default(0),
});
export const opsMembersSchema = z.object({
  id: z.string().uuid(),
  search: z.string().trim().max(160).default(""),
  page: z.number().int().min(0).max(100000).default(0),
});
const text = z.string().trim().min(3).max(160);
const description = z.string().max(8000).default("");
const owner = z.string().uuid().nullable().default(null);
const instant = z.string().datetime({ offset: true }).nullable().default(null);
const versioned = z.object({ id: z.string().uuid(), row_version: z.number().int().positive() });
const caseFields = z.object({
  subject: text,
  description,
  priority: z.enum(["untriaged", "low", "normal", "high", "urgent"]),
  phase: z.enum(["triage", "in_progress", "waiting_customer"]),
  owner_id: owner,
  due_at: instant,
});
const incidentFields = z.object({
  title: text,
  description,
  severity: z.enum(["unclassified", "minor", "major", "critical"]),
  phase: z.enum(["unknown", "investigating", "identified", "monitoring"]),
  owner_id: owner,
  impact_started_at: instant,
});
const releaseFields = z.object({ title: z.string().trim().max(160), summary: description });
const note = z.object({ id: z.string().uuid(), note: z.string().trim().min(1).max(8000) });
export const opsPayloads = {
  "cases.create": caseFields.extend({ company_id: z.string().uuid() }).strict(),
  "cases.update": versioned.merge(caseFields).strict(),
  "cases.close": versioned.strict(),
  "cases.reopen": versioned.strict(),
  "cases.comment": note.strict(),
  "incidents.create": incidentFields.strict(),
  "incidents.update": versioned.merge(incidentFields).strict(),
  "incidents.resolve": versioned.strict(),
  "incidents.reopen": versioned.strict(),
  "incidents.comment": note.strict(),
  "segments.create": z.object({ name: z.string().trim().min(2).max(80) }).strict(),
  "segments.rename": versioned.extend({ name: z.string().trim().min(2).max(80) }).strict(),
  "segments.archive": versioned.strict(),
  "segments.restore": versioned.strict(),
  "segments.members": versioned
    .extend({
      mode: z.enum(["add", "remove"]),
      company_ids: z
        .array(z.string().uuid())
        .min(1)
        .max(100)
        .refine((ids) => new Set(ids).size === ids.length, "Choose each business once"),
    })
    .strict(),
  "segments.undo": versioned.extend({ event_id: z.string().regex(/^\d+$/) }).strict(),
  "releases.create": releaseFields
    .extend({ version: z.string().regex(/^\d+\.\d+\.\d+$/) })
    .strict(),
  "releases.update": versioned.merge(releaseFields).strict(),
  "releases.evidence": versioned
    .extend({ change_reference: z.string().trim().min(3).max(1000) })
    .strict(),
  "releases.rollback": versioned
    .extend({ rollback_reference: z.string().trim().min(3).max(1000) })
    .strict(),
  "releases.comment": note.strict(),
} as const;
export type OpsCommand = keyof typeof opsPayloads;
export const opsApplySchema = z
  .object({
    command: z.custom<OpsCommand>(
      (v) => typeof v === "string" && Object.hasOwn(opsPayloads, v),
      "Unknown operation",
    ),
    payload: z.record(z.string(), z.unknown()),
    reason: z.string().trim().min(3).max(1000),
    requestId: z.string().uuid(),
  })
  .strict()
  .transform((v) => ({ ...v, payload: opsPayloads[v.command].parse(v.payload) }));
export type OpsRecord = {
  id: string;
  row_version: number;
  created_at: string;
  updated_at: string | null;
  subject?: string;
  title?: string | null;
  name?: string;
  description?: string;
  priority?: string;
  severity?: string;
  phase?: string;
  status?: string;
  owner_id?: string | null;
  owner_name?: string | null;
  due_at?: string | null;
  impact_started_at?: string | null;
  closed_at?: string | null;
  resolved_at?: string | null;
  company_id?: string;
  company_name?: string;
  members?: number;
  archived_at?: string | null;
  version?: string;
  summary?: string;
  stage?: string;
  change_reference?: string | null;
  rollback_reference?: string | null;
};
export type OpsContext = { modules: { key: OpsModule; label: string; canManage: boolean }[] };
export type OpsTimeline = {
  id: string;
  action: string;
  reason: string;
  note: string | null;
  actor_id: string | null;
  actor_name: string | null;
  at: string;
  undo_available: boolean;
};
export type OpsDetail = { record: OpsRecord; timeline: OpsTimeline[] };
export type OpsResult = {
  record: OpsRecord;
  changed: number;
  undoEvent: string | null;
  requestId: string;
};
export type OpsOption = { id: string; label: string; added_at?: string | null };
export function opsTitle(r: OpsRecord) {
  return r.subject || r.title || r.name || r.version || r.id;
}
export function localDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return (
    [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-") +
    "T" +
    [d.getHours(), d.getMinutes()].map((v) => String(v).padStart(2, "0")).join(":")
  );
}
export function localDateToUtc(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || localDateInput(date.toISOString()) !== value)
    throw new Error("Choose a valid local date and time");
  return date.toISOString();
}
