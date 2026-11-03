// Synthetic browser transport. Worker execution, authorization and retries use actual SQL tests.
import type { AutomationModule, AutomationRow } from "../../src/lib/platform/automation";
const params = new URLSearchParams(location.search);
const id = "90000000-0000-4000-8000-000000000001";
const rows: Record<AutomationModule, AutomationRow[]> = {
  jobs: [
    {
      id,
      name: "check_operations",
      kind: "check_operations",
      status: "failed",
      attempts: 5,
      max_attempts: 5,
      row_version: 11,
      created_at: "2026-11-03T00:00:00Z",
      finished_at: "2026-11-03T00:10:00Z",
      last_error: "Handler failed (P0001)",
    },
  ],
  rules: [
    {
      id,
      name: "Overdue service cases",
      metric: "overdue_cases",
      state: "paused",
      status: "paused",
      enabled: false,
      threshold: "0",
      observed: null,
      observed_at: null,
      row_version: 1,
      severity: "warning",
      quiet_start_utc: null,
      quiet_end_utc: null,
    },
  ],
  events: [
    {
      id,
      name: "Overdue service cases",
      metric: "overdue_cases",
      status: "open",
      observed: "2",
      threshold: "0",
      observations: 2,
      severity: "warning",
      first_seen_at: "2026-11-03T00:00:00Z",
      last_seen_at: "2026-11-03T00:01:00Z",
      resolved_at: null,
      acknowledged_at: null,
    },
  ],
};
export async function getAutomationContext() {
  if (params.has("automationDenied")) throw new Error("Platform automation permission required");
  return {
    modules: [
      { key: "jobs", label: "Background jobs", canManage: !params.has("readonly") },
      { key: "rules", label: "Alert rules", canManage: !params.has("readonly") },
      { key: "events", label: "Alert history", canManage: !params.has("readonly") },
    ],
    worker: {
      configured: !params.has("unconfigured"),
      enabled: true,
      state: params.has("unconfigured") ? "unconfigured" : "recent_tick",
      startedAt: "2026-11-03T00:10:00Z",
      finishedAt: "2026-11-03T00:10:01Z",
      lastJobs: 2,
    },
  };
}
export async function readAutomation({
  data,
}: {
  data: { module: AutomationModule | "runs"; status: string; search: string };
}) {
  if (params.has("automationError")) throw new Error("Automation source unavailable");
  if (data.module === "runs")
    return {
      rows: [
        {
          id: "1",
          attempt: 1,
          status: "failed",
          started_at: "2026-11-03T00:00:00Z",
          finished_at: "2026-11-03T00:00:01Z",
          error_code: "P0001",
        },
      ],
      total: 1,
    };
  const filtered = params.has("empty")
    ? []
    : rows[data.module].filter(
        (r) =>
          JSON.stringify(r).toLowerCase().includes(data.search.toLowerCase()) &&
          (data.status === "all" || r.status === data.status),
      );
  return { rows: filtered, total: filtered.length };
}
export async function actAutomation({
  data,
}: {
  data: { command: string; payload: Record<string, unknown>; reason: string; requestId: string };
}) {
  if (params.has("conflict")) throw new Error("This rule changed. Reload before retrying");
  const [kind, action] = data.command.split(".");
  const p = data.payload;
  const module = kind === "alerts" ? "events" : (kind as AutomationModule);
  let r = rows[module].find((r) => r.id === p["id"]);
  if (action === "enqueue") {
    r = {
      id: crypto.randomUUID(),
      name: String(p["kind"]),
      kind: String(p["kind"]),
      status: "queued",
      attempts: 0,
      max_attempts: 5,
      row_version: 1,
      created_at: new Date().toISOString(),
    };
    rows.jobs.unshift(r);
  } else if (action === "save") {
    if (!r) {
      r = {
        ...p,
        id: crypto.randomUUID(),
        row_version: 1,
        status: "paused",
        state: "paused",
        enabled: false,
        observed: null,
        observed_at: null,
      } as AutomationRow;
      rows.rules.unshift(r);
    } else Object.assign(r, p, { row_version: (r.row_version || 0) + 1 });
  } else if (r) {
    if (action === "enable")
      Object.assign(r, {
        enabled: true,
        state: "unknown",
        status: "unknown",
        observed: null,
        row_version: (r.row_version || 0) + 1,
      });
    if (action === "disable")
      Object.assign(r, {
        enabled: false,
        state: "paused",
        status: "paused",
        row_version: (r.row_version || 0) + 1,
      });
    if (action === "retry")
      Object.assign(r, {
        status: "queued",
        max_attempts: (r.max_attempts || 0) + 5,
        row_version: (r.row_version || 0) + 1,
      });
    if (action === "cancel") r.status = "cancelled";
    if (action === "ack") r.acknowledged_at = new Date().toISOString();
  }
  if (!r) throw new Error("Record missing");
  return { id: r.id, record: r };
}
