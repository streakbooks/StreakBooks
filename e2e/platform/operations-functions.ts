// Browser transport adapter only. Real authorization and transactions run in the SQL harness.
import type {
  OpsDetail,
  OpsModule,
  OpsRecord,
  OpsTimeline,
} from "../../src/lib/platform/operations";
const params = new URLSearchParams(location.search);
const company = "20000000-0000-4000-8000-000000000001";
const staff = "00000000-0000-4000-8000-000000000003";
const sample = "80000000-0000-4000-8000-000000000001";
const stores: Record<OpsModule, OpsRecord[]> = {
  cases: [],
  incidents: [],
  segments: [],
  releases: [],
};
const history = new Map<string, OpsTimeline[]>();
if (!params.has("empty")) {
  stores.cases.push({
    id: sample,
    company_id: company,
    company_name: "Example Company",
    subject: "Invoice assistance",
    description: "Review customer request",
    priority: "high",
    phase: "triage",
    status: "open",
    owner_id: staff,
    owner_name: "Support One",
    created_at: "2026-11-03T00:00:00Z",
    updated_at: null,
    row_version: 1,
  });
  stores.segments.push({
    id: sample,
    name: "Growing businesses",
    status: "active",
    members: 1,
    created_at: "2026-11-03T00:00:00Z",
    updated_at: null,
    row_version: 1,
  });
}
export async function getOpsContext() {
  if (params.has("opsDenied")) throw new Error("Platform operations permission required");
  return {
    modules: ["cases", "incidents", "segments", "releases"].map((key) => ({
      key,
      label: (
        {
          cases: "Service cases",
          incidents: "Incidents",
          segments: "Business segments",
          releases: "Release records",
        } as Record<string, string>
      )[key],
      canManage: !params.has("readonly"),
    })),
  };
}
export async function listOps({
  data,
}: {
  data: { module: OpsModule; search: string; status: string };
}) {
  if (params.has("opsError")) throw new Error("Operations unavailable");
  const rows = stores[data.module].filter(
    (r) =>
      JSON.stringify(r).toLowerCase().includes(data.search.toLowerCase()) &&
      (data.status === "all" || [r.status, r.phase, r.stage].includes(data.status)),
  );
  return { rows, total: rows.length, pageSize: 25 };
}
export async function getOpsDetail({
  data,
}: {
  data: { module: OpsModule; id: string };
}): Promise<OpsDetail> {
  const record = stores[data.module].find((r) => r.id === data.id);
  if (!record) throw new Error("That operations record was not found");
  return { record, timeline: history.get(record.id) || [] };
}
export async function lookupOps({ data }: { data: { kind: string; search: string } }) {
  const rows = [
    {
      id: data.kind === "business" ? company : staff,
      label: data.kind === "business" ? "Example Company" : "Support One",
    },
  ].filter((r) => `${r.id} ${r.label}`.toLowerCase().includes(data.search.toLowerCase()));
  return { rows, total: rows.length };
}
export async function listOpsMembers() {
  return { rows: [{ id: company, label: "Example Company" }], total: 1 };
}
export async function previewOpsMembers({ data }: { data: { companyIds: string[] } }) {
  return {
    rowVersion: 1,
    changed: data.companyIds.length,
    rows: data.companyIds.map((id) => ({ id, label: "Example Company", changes: true })),
  };
}
const receipts = new Map<string, unknown>();
export async function applyOps({
  data,
}: {
  data: { command: string; payload: Record<string, unknown>; reason: string; requestId: string };
}) {
  if (params.has("conflict"))
    throw new Error("This record changed. Reload the latest values before retrying");
  if (receipts.has(data.requestId)) return receipts.get(data.requestId);
  const [module, action] = data.command.split(".") as [OpsModule, string];
  const p = data.payload;
  const existing = stores[module].find((r) => r.id === p["id"]);
  const now = new Date().toISOString();
  const record = {
    ...(existing || { id: crypto.randomUUID(), created_at: now, row_version: 0 }),
    ...p,
    updated_at: now,
    row_version: (existing?.row_version || 0) + 1,
  } as OpsRecord;
  if (action === "create") {
    record.status = module === "segments" ? "active" : "open";
    record.stage = module === "releases" ? "planned" : undefined;
    record.company_name = module === "cases" ? "Example Company" : undefined;
    stores[module].unshift(record);
  } else {
    if (!existing) throw new Error("Missing record");
    Object.assign(existing, record);
  }
  if (action === "close") record.status = "closed";
  if (action === "resolve") record.status = "resolved";
  if (action === "reopen") record.status = "open";
  if (action === "archive") record.status = "archived";
  if (action === "restore") record.status = "active";
  if (action === "evidence") record.stage = "recorded";
  if (action === "rollback") record.stage = "rolled_back";
  if (existing) Object.assign(existing, record);
  const event: OpsTimeline = {
    id: String((history.get(record.id)?.length || 0) + 1),
    action: data.command,
    reason: data.reason,
    note: String(p["note"] || "") || null,
    actor_id: staff,
    actor_name: "Support One",
    at: now,
    undo_available: action === "members",
  };
  history.set(record.id, [event, ...(history.get(record.id) || [])]);
  const response = { record, changed: 1, undoEvent: null, requestId: data.requestId };
  receipts.set(data.requestId, response);
  return response;
}
