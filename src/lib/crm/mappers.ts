import type {
  CrmActivity,
  CrmDashboardKpis,
  CrmLead,
  CrmLeadSource,
  CrmOpportunity,
  CrmPipeline,
  CrmPipelineStage,
  CrmSettings,
} from "@/lib/crm/types";
import { emptyCrmDashboardKpis } from "@/lib/crm/types";

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v);
  return s.length ? s : null;
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

type SettingsRow = {
  companyId?: string;
  company_id?: string;
  enabled?: boolean;
  leadNumberPrefix?: string;
  lead_number_prefix?: string;
  opportunityNumberPrefix?: string;
  opportunity_number_prefix?: string;
  staleDealDays?: number;
  stale_deal_days?: number;
  defaultPipelineId?: string | null;
  default_pipeline_id?: string | null;
  version?: number;
  updatedAt?: string | null;
  updated_at?: string | null;
};

type KpiRow = {
  totalLeads?: number;
  newLeads?: number;
  qualifiedLeads?: number;
  unassignedLeads?: number;
  activeOpportunities?: number;
  pipelineValueMinor?: number;
  weightedPipelineValueMinor?: number;
  dealsWon?: number;
  dealsLost?: number;
  winRatePct?: number | null;
  overdueFollowUps?: number;
  upcomingMeetings?: number;
  forecastRevenueMinor?: number;
  stagnantDeals?: number;
  expectedDealValueMinor?: number;
  rangeFrom?: string;
  rangeTo?: string;
  note?: string;
};

type LeadRow = {
  id?: string;
  lead_number?: string;
  status?: CrmLead["status"];
  person_type?: CrmLead["personType"];
  first_name?: string | null;
  last_name?: string | null;
  organization_name?: string | null;
  job_title?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  industry?: string | null;
  source_id?: string | null;
  owner_user_id?: string | null;
  estimated_value_minor?: number;
  currency_code?: string;
  score?: number;
  tags?: string[] | null;
  notes?: string | null;
  next_follow_up_at?: string | null;
  contact_id?: string | null;
  converted_opportunity_id?: string | null;
  converted_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

type PipelineRow = {
  id?: string;
  name?: string;
  description?: string | null;
  is_default?: boolean;
  is_active?: boolean;
  sort_order?: number;
};

type StageRow = {
  id?: string;
  pipeline_id?: string;
  name?: string;
  probability_pct?: number;
  sort_order?: number;
  is_won?: boolean;
  is_lost?: boolean;
  is_active?: boolean;
};

type OpportunityRow = {
  id?: string;
  opportunity_number?: string;
  name?: string;
  pipeline_id?: string;
  stage_id?: string;
  status?: CrmOpportunity["status"];
  contact_id?: string | null;
  lead_id?: string | null;
  owner_user_id?: string | null;
  amount_minor?: number;
  currency_code?: string;
  probability_pct?: number;
  expected_close_date?: string | null;
  priority?: string;
  notes?: string | null;
  stage_entered_at?: string;
  version?: number;
  created_at?: string;
  updated_at?: string;
};

type ActivityRow = {
  id?: string;
  kind?: CrmActivity["kind"];
  subject?: string;
  body?: string | null;
  status?: CrmActivity["status"];
  priority?: string;
  owner_user_id?: string | null;
  due_at?: string | null;
  remind_at?: string | null;
  completed_at?: string | null;
  lead_id?: string | null;
  opportunity_id?: string | null;
  contact_id?: string | null;
  created_at?: string;
};

type SourceRow = {
  id?: string;
  code?: string;
  name?: string;
  is_active?: boolean;
  sort_order?: number;
};

export function mapCrmSettings(raw: unknown): CrmSettings {
  const row = (raw ?? {}) as SettingsRow;
  return {
    companyId: String(row.companyId ?? row.company_id ?? ""),
    enabled: Boolean(row.enabled),
    leadNumberPrefix: String(row.leadNumberPrefix ?? row.lead_number_prefix ?? "LEAD-"),
    opportunityNumberPrefix: String(
      row.opportunityNumberPrefix ?? row.opportunity_number_prefix ?? "OPP-",
    ),
    staleDealDays: num(row.staleDealDays ?? row.stale_deal_days, 30),
    defaultPipelineId: str(row.defaultPipelineId ?? row.default_pipeline_id),
    version: num(row.version, 1),
    updatedAt: str(row.updatedAt ?? row.updated_at),
  };
}

export function mapCrmDashboardKpis(raw: unknown): CrmDashboardKpis {
  if (!raw || typeof raw !== "object") return emptyCrmDashboardKpis();
  const row = raw as KpiRow;
  const base = emptyCrmDashboardKpis();
  return {
    ...base,
    totalLeads: num(row.totalLeads),
    newLeads: num(row.newLeads),
    qualifiedLeads: num(row.qualifiedLeads),
    unassignedLeads: num(row.unassignedLeads),
    activeOpportunities: num(row.activeOpportunities),
    pipelineValueMinor: num(row.pipelineValueMinor),
    weightedPipelineValueMinor: num(row.weightedPipelineValueMinor),
    dealsWon: num(row.dealsWon),
    dealsLost: num(row.dealsLost),
    winRatePct: row.winRatePct == null ? null : num(row.winRatePct),
    overdueFollowUps: num(row.overdueFollowUps),
    upcomingMeetings: num(row.upcomingMeetings),
    forecastRevenueMinor: num(row.forecastRevenueMinor),
    stagnantDeals: num(row.stagnantDeals),
    expectedDealValueMinor: num(row.expectedDealValueMinor),
    rangeFrom: str(row.rangeFrom) ?? base.rangeFrom,
    rangeTo: str(row.rangeTo) ?? base.rangeTo,
    note: str(row.note) ?? base.note,
  };
}

export function mapCrmLead(raw: LeadRow | Record<string, unknown>): CrmLead {
  const row = raw as LeadRow;
  return {
    id: String(row.id ?? ""),
    leadNumber: String(row.lead_number ?? ""),
    status: row.status ?? "new",
    personType: row.person_type ?? "individual",
    firstName: str(row.first_name),
    lastName: str(row.last_name),
    organizationName: str(row.organization_name),
    jobTitle: str(row.job_title),
    email: str(row.email),
    phone: str(row.phone),
    website: str(row.website),
    industry: str(row.industry),
    sourceId: str(row.source_id),
    ownerUserId: str(row.owner_user_id),
    estimatedValueMinor: num(row.estimated_value_minor),
    currencyCode: String(row.currency_code ?? "USD"),
    score: num(row.score),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    notes: str(row.notes),
    nextFollowUpAt: str(row.next_follow_up_at),
    contactId: str(row.contact_id),
    convertedOpportunityId: str(row.converted_opportunity_id),
    convertedAt: str(row.converted_at),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export function mapCrmPipeline(raw: PipelineRow | Record<string, unknown>): CrmPipeline {
  const row = raw as PipelineRow;
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    description: str(row.description),
    isDefault: Boolean(row.is_default),
    isActive: row.is_active !== false,
    sortOrder: num(row.sort_order, 100),
  };
}

export function mapCrmPipelineStage(raw: StageRow | Record<string, unknown>): CrmPipelineStage {
  const row = raw as StageRow;
  return {
    id: String(row.id ?? ""),
    pipelineId: String(row.pipeline_id ?? ""),
    name: String(row.name ?? ""),
    probabilityPct: num(row.probability_pct),
    sortOrder: num(row.sort_order, 100),
    isWon: Boolean(row.is_won),
    isLost: Boolean(row.is_lost),
    isActive: row.is_active !== false,
  };
}

export function mapCrmOpportunity(raw: OpportunityRow | Record<string, unknown>): CrmOpportunity {
  const row = raw as OpportunityRow;
  return {
    id: String(row.id ?? ""),
    opportunityNumber: String(row.opportunity_number ?? ""),
    name: String(row.name ?? ""),
    pipelineId: String(row.pipeline_id ?? ""),
    stageId: String(row.stage_id ?? ""),
    status: row.status ?? "open",
    contactId: str(row.contact_id),
    leadId: str(row.lead_id),
    ownerUserId: str(row.owner_user_id),
    amountMinor: num(row.amount_minor),
    currencyCode: String(row.currency_code ?? "USD"),
    probabilityPct: num(row.probability_pct),
    expectedCloseDate: str(row.expected_close_date),
    priority: String(row.priority ?? "normal"),
    notes: str(row.notes),
    stageEnteredAt: String(row.stage_entered_at ?? ""),
    version: num(row.version, 1),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export function mapCrmActivity(raw: ActivityRow | Record<string, unknown>): CrmActivity {
  const row = raw as ActivityRow;
  return {
    id: String(row.id ?? ""),
    kind: row.kind ?? "task",
    subject: String(row.subject ?? ""),
    body: str(row.body),
    status: row.status ?? "open",
    priority: String(row.priority ?? "normal"),
    ownerUserId: str(row.owner_user_id),
    dueAt: str(row.due_at),
    remindAt: str(row.remind_at),
    completedAt: str(row.completed_at),
    leadId: str(row.lead_id),
    opportunityId: str(row.opportunity_id),
    contactId: str(row.contact_id),
    createdAt: String(row.created_at ?? ""),
  };
}

export function mapCrmLeadSource(raw: SourceRow | Record<string, unknown>): CrmLeadSource {
  const row = raw as SourceRow;
  return {
    id: String(row.id ?? ""),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    isActive: row.is_active !== false,
    sortOrder: num(row.sort_order, 100),
  };
}