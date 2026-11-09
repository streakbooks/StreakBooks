export type CrmLeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "nurturing"
  | "converted"
  | "disqualified";

export type CrmOpportunityStatus = "open" | "won" | "lost" | "archived";

export type CrmActivityKind =
  | "call"
  | "email"
  | "meeting"
  | "demo"
  | "site_visit"
  | "message"
  | "task"
  | "note"
  | "other";

export type CrmSettings = {
  companyId: string;
  enabled: boolean;
  leadNumberPrefix: string;
  opportunityNumberPrefix: string;
  staleDealDays: number;
  defaultPipelineId: string | null;
  version: number;
  updatedAt: string | null;
};

export type CrmDashboardKpis = {
  totalLeads: number;
  newLeads: number;
  qualifiedLeads: number;
  unassignedLeads: number;
  activeOpportunities: number;
  pipelineValueMinor: number;
  weightedPipelineValueMinor: number;
  dealsWon: number;
  dealsLost: number;
  winRatePct: number | null;
  overdueFollowUps: number;
  upcomingMeetings: number;
  forecastRevenueMinor: number;
  stagnantDeals: number;
  expectedDealValueMinor: number;
  rangeFrom: string;
  rangeTo: string;
  note: string;
};

export type CrmLead = {
  id: string;
  leadNumber: string;
  status: CrmLeadStatus;
  personType: "individual" | "business";
  firstName: string | null;
  lastName: string | null;
  organizationName: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  industry: string | null;
  sourceId: string | null;
  ownerUserId: string | null;
  estimatedValueMinor: number;
  currencyCode: string;
  score: number;
  tags: string[];
  notes: string | null;
  nextFollowUpAt: string | null;
  contactId: string | null;
  convertedOpportunityId: string | null;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CrmLeadDraftInput = {
  id?: string;
  status?: CrmLeadStatus;
  personType?: "individual" | "business";
  firstName?: string;
  lastName?: string;
  organizationName?: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  website?: string;
  industry?: string;
  sourceId?: string | null;
  ownerUserId?: string | null;
  estimatedValueMinor?: number;
  currencyCode?: string;
  score?: number;
  tags?: string[];
  notes?: string;
  nextFollowUpAt?: string | null;
  disqualifiedReason?: string | null;
};

export type CrmPipeline = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type CrmPipelineStage = {
  id: string;
  pipelineId: string;
  name: string;
  probabilityPct: number;
  sortOrder: number;
  isWon: boolean;
  isLost: boolean;
  isActive: boolean;
};

export type CrmOpportunity = {
  id: string;
  opportunityNumber: string;
  name: string;
  pipelineId: string;
  stageId: string;
  status: CrmOpportunityStatus;
  contactId: string | null;
  leadId: string | null;
  ownerUserId: string | null;
  amountMinor: number;
  currencyCode: string;
  probabilityPct: number;
  expectedCloseDate: string | null;
  priority: string;
  notes: string | null;
  stageEnteredAt: string;
  createdAt: string;
  updatedAt: string;
};

export type CrmOpportunityDraftInput = {
  id?: string;
  name: string;
  pipelineId?: string;
  stageId?: string;
  contactId?: string | null;
  leadId?: string | null;
  ownerUserId?: string | null;
  amountMinor?: number;
  currencyCode?: string;
  probabilityPct?: number;
  expectedCloseDate?: string | null;
  priority?: string;
  sourceId?: string | null;
  notes?: string | null;
};

export type CrmActivity = {
  id: string;
  kind: CrmActivityKind;
  subject: string;
  body: string | null;
  status: "open" | "completed" | "cancelled";
  priority: string;
  ownerUserId: string | null;
  dueAt: string | null;
  remindAt: string | null;
  completedAt: string | null;
  leadId: string | null;
  opportunityId: string | null;
  contactId: string | null;
  createdAt: string;
};

export type CrmLeadSource = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

export function displayLeadName(lead: Pick<
  CrmLead,
  "organizationName" | "firstName" | "lastName" | "email" | "leadNumber"
>): string {
  if (lead.organizationName?.trim()) return lead.organizationName.trim();
  const person = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
  if (person) return person;
  if (lead.email?.trim()) return lead.email.trim();
  return lead.leadNumber;
}

export function emptyCrmDashboardKpis(): CrmDashboardKpis {
  return {
    totalLeads: 0,
    newLeads: 0,
    qualifiedLeads: 0,
    unassignedLeads: 0,
    activeOpportunities: 0,
    pipelineValueMinor: 0,
    weightedPipelineValueMinor: 0,
    dealsWon: 0,
    dealsLost: 0,
    winRatePct: null,
    overdueFollowUps: 0,
    upcomingMeetings: 0,
    forecastRevenueMinor: 0,
    stagnantDeals: 0,
    expectedDealValueMinor: 0,
    rangeFrom: new Date().toISOString(),
    rangeTo: new Date().toISOString(),
    note: "Pipeline and forecast figures are CRM expectations, not posted accounting revenue.",
  };
}
