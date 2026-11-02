import { isReportDate } from "./date-validation";
import type { ColumnMode } from "@/lib/reports/statements";

/** URL state of a report page, so every drill-down is linkable and survives reload (RP-05). */
export type ReportSearch = {
  from?: string;
  to?: string;
  account?: string;
  columns?: ColumnMode;
  compare?: "prior_year" | "prior_month" | "months";
  page?: number;
  source?: string;
  status?: string;
  actor?: string;
  entity?: string;
  action?: string;
  basis?: "accrual" | "cash";
  /** Budget vs Actual: which budget, and monthly / quarterly / year-to-date columns. */
  budget?: string;
  view?: "month" | "quarter" | "ytd";
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMN_MODES: ColumnMode[] = ["none", "prior_period", "prior_year", "month", "quarter"];
const COMPARES = ["prior_year", "prior_month", "months"] as const;

function str(v: unknown, max = 80): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
}

export function parseReportSearch(raw: Record<string, unknown>): ReportSearch {
  const out: ReportSearch = {};
  const from = typeof raw["from"] === "string" ? raw["from"].trim() : undefined;
  if (from && isReportDate(from)) out.from = from;
  const to = typeof raw["to"] === "string" ? raw["to"].trim() : undefined;
  if (to && isReportDate(to)) out.to = to;
  const account = str(raw["account"], 36);
  if (account && UUID.test(account)) out.account = account;
  if (COLUMN_MODES.includes(raw["columns"] as ColumnMode) && raw["columns"] !== "none") {
    out.columns = raw["columns"] as ColumnMode;
  }
  if ((COMPARES as readonly unknown[]).includes(raw["compare"])) {
    out.compare = raw["compare"] as (typeof COMPARES)[number];
  }
  const page = Number(raw["page"]);
  if (Number.isInteger(page) && page > 0) out.page = page;
  const source = str(raw["source"], 40);
  if (source) out.source = source;
  const status = str(raw["status"], 20);
  if (status) out.status = status;
  const actor = str(raw["actor"], 36);
  if (actor && UUID.test(actor)) out.actor = actor;
  const entity = str(raw["entity"], 60);
  if (entity) out.entity = entity;
  const action = str(raw["action"], 80);
  if (action) out.action = action;
  const budget = str(raw["budget"], 36);
  if (budget && UUID.test(budget)) out.budget = budget;
  if (raw["view"] === "month" || raw["view"] === "quarter" || raw["view"] === "ytd") {
    out.view = raw["view"];
  }
  if (raw["basis"] === "cash" || raw["basis"] === "accrual") out.basis = raw["basis"];
  return out;
}
