import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { callRpc, companyIdOf, isMissingRelation } from "@/lib/planning/rpc";
import {
  mapCrmActivity,
  mapCrmCampaign,
  mapCrmDashboardKpis,
  mapCrmLead,
  mapCrmLeadSource,
  mapCrmOpportunity,
  mapCrmPipeline,
  mapCrmPipelineStage,
  mapCrmSettings,
  mapCrmTerritory,
} from "@/lib/crm/mappers";
import { crmClient } from "@/lib/crm/query";
import { buildIlikeOr } from "@/lib/purchases/search-terms";
import type {
  CrmActivity,
  CrmCampaign,
  CrmCampaignStatus,
  CrmDashboardKpis,
  CrmLead,
  CrmLeadDraftInput,
  CrmLeadSource,
  CrmOpportunity,
  CrmOpportunityDraftInput,
  CrmPipeline,
  CrmPipelineStage,
  CrmSettings,
  CrmTerritory,
} from "@/lib/crm/types";
import { CRM_CAMPAIGN_STATUSES, validateCrmCampaignDraft } from "@/lib/crm/campaign-draft";
import { validateCrmTerritoryDraft } from "@/lib/crm/territory-draft";
import { emptyCrmDashboardKpis } from "@/lib/crm/types";
import {
  buildCrmAccountOverlay,
  type CrmAccountOverlayRow,
} from "@/lib/crm/account-overlay";
import {
  buildCrmPersonDirectory,
  type CrmAccountPerson,
  type CrmPersonDirectoryRow,
} from "@/lib/crm/person-directory";
import { buildOpportunityQuoteLine } from "@/lib/crm/quote-bridge";
import {
  buildCrmDealInvoiceRow,
  type CrmDealInvoiceRow,
} from "@/lib/crm/payment-visibility";
import {
  buildForecastReport,
  type ForecastReport,
} from "@/lib/crm/forecast-report";
import { resolveCrmCommsPolicy, type CrmCommsPolicy } from "@/lib/crm/comms-policy";
import {
  resolveCrmAutomationPolicy,
  type CrmAutomationPolicy,
} from "@/lib/crm/automation-policy";
import {
  resolveCrmImportExportPolicy,
  type CrmImportExportPolicy,
} from "@/lib/crm/import-export-policy";
import {
  resolveCrmTerritoryPolicy,
  type CrmTerritoryPolicy,
} from "@/lib/crm/territory-policy";
import {
  buildCrmTeamWorkload,
  type CrmTeamWorkloadRow,
} from "@/lib/crm/team-workload";
import {
  resolveCrmPublicFormsPolicy,
  type CrmPublicFormsPolicy,
} from "@/lib/crm/public-forms-policy";
import { saveSalesDocument } from "@/lib/sales/doc-save";
import {
  loadCompanyDefaults,
  normaliseCurrencyAndFx,
  prepareSalesLines,
} from "@/lib/sales/sales-common";

export const CRM_MIGRATION =
  "CRM is not available yet: the database update 20261109120000 has not been applied.";

export const CRM_GAP_MIGRATION =
  "CRM gap-closure features need database update 20261109130000 (duplicate matching, scoring, reopen).";

export const CRM_PIPELINE_ADMIN_MIGRATION =
  "CRM pipeline admin needs database update 20261109160000 (upsert pipelines/stages).";

export const CRM_CAMPAIGNS_MIGRATION =
  "CRM campaigns need database update 20261109170000 (campaign records).";

export const CRM_TERRITORIES_MIGRATION =
  "CRM territories need database update 20261109180000 (territory records).";

async function requireCrmView(supabase: unknown, companyId: string) {
  await assertCompanyMember(supabase as never, companyId);
  await assertCompanyPermission(supabase as never, companyId, "crm.view");
}

function throwIfRelation(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (isMissingRelation(error)) throw new Error(CRM_MIGRATION);
  throw new Error(error.message);
}

export const getCrmSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<CrmSettings> => {
    await requireCrmView(context.supabase, data.companyId);
    const raw = await callRpc<unknown>(
      context.supabase,
      "get_crm_settings",
      { _company_id: data.companyId },
      CRM_MIGRATION,
    );
    return mapCrmSettings(raw);
  });

export const upsertCrmSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      enabled: boolean;
      leadNumberPrefix?: string;
      opportunityNumberPrefix?: string;
      staleDealDays?: number;
      expectedVersion?: number;
    }) => ({
      companyId: companyIdOf(input),
      enabled: Boolean(input.enabled),
      leadNumberPrefix: input.leadNumberPrefix?.trim().slice(0, 12),
      opportunityNumberPrefix: input.opportunityNumberPrefix?.trim().slice(0, 12),
      staleDealDays:
        typeof input.staleDealDays === "number"
          ? Math.min(3650, Math.max(1, input.staleDealDays))
          : undefined,
      expectedVersion:
        typeof input.expectedVersion === "number" ? input.expectedVersion : undefined,
    }),
  )
  .handler(async ({ data, context }): Promise<CrmSettings> => {
    await assertCompanyPermission(context.supabase, data.companyId, "crm.admin");
    const raw = await callRpc<unknown>(
      context.supabase,
      "upsert_crm_settings",
      {
        _company_id: data.companyId,
        _enabled: data.enabled,
        _lead_number_prefix: data.leadNumberPrefix ?? null,
        _opportunity_number_prefix: data.opportunityNumberPrefix ?? null,
        _stale_deal_days: data.staleDealDays ?? null,
        _expected_version: data.expectedVersion ?? null,
      },
      CRM_MIGRATION,
    );
    return mapCrmSettings(raw);
  });

export const getCrmDashboardKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; from?: string; to?: string }) => ({
    companyId: companyIdOf(input),
    from: input.from || undefined,
    to: input.to || undefined,
  }))
  .handler(async ({ data, context }): Promise<CrmDashboardKpis> => {
    await requireCrmView(context.supabase, data.companyId);
    try {
      const raw = await callRpc<unknown>(
        context.supabase,
        "get_crm_dashboard_kpis",
        {
          _company_id: data.companyId,
          _from: data.from ?? null,
          _to: data.to ?? null,
        },
        CRM_MIGRATION,
      );
      return mapCrmDashboardKpis(raw);
    } catch (error) {
      if (error instanceof Error && error.message === CRM_MIGRATION) {
        return emptyCrmDashboardKpis();
      }
      throw error;
    }
  });

export const listCrmLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string;
    status?: string;
    activeOnly?: boolean;
    q?: string;
    limit?: number;
    offset?: number;
  }) => ({
    companyId: companyIdOf(input),
    status: input.status?.trim() || undefined,
    activeOnly: input.activeOnly === true,
    q: (input.q ?? "").trim().slice(0, 120),
    limit: Math.min(Math.max(input.limit ?? 100, 1), 500),
    offset: Number.isSafeInteger(input.offset) && (input.offset ?? 0) >= 0
      ? Math.min(input.offset ?? 0, 1000000)
      : 0,
  }))
  .handler(async ({ data, context }): Promise<CrmLead[]> => {
    await requireCrmView(context.supabase, data.companyId);
    let q = crmClient(context.supabase)
      .from("crm_leads")
      .select("*")
      .eq("company_id", data.companyId)
      .is("archived_at", null);
    if (data.status) q = q.eq("status", data.status);
    if (data.activeOnly) q = q.not("status", "in", "(converted,disqualified)");
    const filter = buildIlikeOr(
      ["lead_number", "first_name", "last_name", "organization_name", "email"], data.q,
    );
    if (filter) q = q.or(filter);
    // Stable ordering allows deterministic page navigation when timestamps are equal.
    q = q.order("updated_at", { ascending: false }).order("id", { ascending: false });
    const { data: rows, error } = await q.range(data.offset, data.offset + data.limit - 1);
    throwIfRelation(error);
    return ((rows as Record<string, unknown>[] | null) ?? []).map(mapCrmLead);
  });

export const getCrmLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; leadId: string }) => ({
    companyId: companyIdOf(input),
    leadId: assertUuid(input.leadId),
  }))
  .handler(async ({ data, context }): Promise<CrmLead> => {
    await requireCrmView(context.supabase, data.companyId);
    const { data: row, error } = await crmClient(context.supabase)
      .from("crm_leads")
      .select("*")
      .eq("company_id", data.companyId)
      .eq("id", data.leadId)
      .maybeSingle();
    throwIfRelation(error);
    if (!row) throw new Error("Lead not found");
    return mapCrmLead(row as Record<string, unknown>);
  });

export const upsertCrmLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string } & CrmLeadDraftInput) => {
    const companyId = companyIdOf(input);
    const firstName = input.firstName?.trim() ?? "";
    const lastName = input.lastName?.trim() ?? "";
    const organizationName = input.organizationName?.trim() ?? "";
    const email = input.email?.trim() ?? "";
    if (!firstName && !lastName && !organizationName && !email) {
      throw new Error("Provide a name, organisation or email for the lead.");
    }
    return {
      companyId,
      id: input.id ? assertUuid(input.id) : undefined,
      status: input.status,
      personType: input.personType ?? (organizationName ? "business" : "individual"),
      firstName: firstName.slice(0, 100) || undefined,
      lastName: lastName.slice(0, 100) || undefined,
      organizationName: organizationName.slice(0, 200) || undefined,
      jobTitle: input.jobTitle?.trim().slice(0, 120) || undefined,
      email: email.slice(0, 200).toLowerCase() || undefined,
      phone: input.phone?.trim().slice(0, 60) || undefined,
      website: input.website?.trim().slice(0, 200) || undefined,
      industry: input.industry?.trim().slice(0, 120) || undefined,
      sourceId: input.sourceId ? assertUuid(input.sourceId) : null,
      ownerUserId: input.ownerUserId ? assertUuid(input.ownerUserId) : undefined,
      estimatedValueMinor:
        typeof input.estimatedValueMinor === "number"
          ? Math.max(0, Math.trunc(input.estimatedValueMinor))
          : 0,
      currencyCode: (input.currencyCode ?? "USD").trim().toUpperCase().slice(0, 3),
      score:
        typeof input.score === "number" ? Math.min(100, Math.max(0, Math.trunc(input.score))) : 0,
      tags: (input.tags ?? []).map((t) => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 20),
      notes: input.notes?.trim().slice(0, 4000) || undefined,
      nextFollowUpAt: input.nextFollowUpAt || null,
      disqualifiedReason: input.disqualifiedReason?.trim().slice(0, 400) || null,
    };
  })
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "crm.leads.manage");
    return callRpc<{ id: string; leadNumber: string; status: string }>(
      context.supabase,
      "upsert_crm_lead",
      {
        _company_id: data.companyId,
        _payload: {
          id: data.id,
          status: data.status,
          personType: data.personType,
          firstName: data.firstName,
          lastName: data.lastName,
          organizationName: data.organizationName,
          jobTitle: data.jobTitle,
          email: data.email,
          phone: data.phone,
          website: data.website,
          industry: data.industry,
          sourceId: data.sourceId,
          ownerUserId: data.ownerUserId,
          estimatedValueMinor: data.estimatedValueMinor,
          currencyCode: data.currencyCode,
          score: data.score,
          tags: data.tags,
          notes: data.notes,
          nextFollowUpAt: data.nextFollowUpAt,
          disqualifiedReason: data.disqualifiedReason,
        },
      },
      CRM_MIGRATION,
    );
  });

export const assignCrmLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; leadId: string; ownerUserId: string | null }) => ({
    companyId: companyIdOf(input),
    leadId: assertUuid(input.leadId),
    ownerUserId: input.ownerUserId ? assertUuid(input.ownerUserId) : null,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "crm.leads.manage");
    return callRpc<{ id: string; ownerUserId: string | null }>(
      context.supabase,
      "assign_crm_lead",
      {
        _company_id: data.companyId,
        _lead_id: data.leadId,
        _owner_user_id: data.ownerUserId,
      },
      CRM_MIGRATION,
    );
  });

export const convertCrmLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      leadId: string;
      createOpportunity?: boolean;
      existingContactId?: string | null;
      allowCreateDespiteMatch?: boolean;
    }) => ({
      companyId: companyIdOf(input),
      leadId: assertUuid(input.leadId),
      createOpportunity: input.createOpportunity !== false,
      existingContactId: input.existingContactId ? assertUuid(input.existingContactId) : null,
      allowCreateDespiteMatch: Boolean(input.allowCreateDespiteMatch),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "crm.leads.manage");
    return callRpc<{ leadId: string; contactId: string; opportunityId: string | null }>(
      context.supabase,
      "convert_crm_lead",
      {
        _company_id: data.companyId,
        _lead_id: data.leadId,
        _create_opportunity: data.createOpportunity,
        _existing_contact_id: data.existingContactId,
        _allow_create_despite_match: data.allowCreateDespiteMatch,
      },
      CRM_GAP_MIGRATION,
    );
  });

export type CrmDuplicateLeadMatch = {
  id: string;
  leadNumber?: string;
  lead_number?: string;
  email?: string | null;
  status?: string;
};

export const findCrmDuplicateLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      email?: string;
      phone?: string;
      organizationName?: string;
      excludeLeadId?: string;
    }) => {
      const email = input.email?.trim();
      const phone = input.phone?.trim();
      const organizationName = input.organizationName?.trim();
      return {
        companyId: companyIdOf(input),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(organizationName ? { organizationName } : {}),
        ...(input.excludeLeadId ? { excludeLeadId: assertUuid(input.excludeLeadId) } : {}),
      };
    },
  )
  .handler(async ({ data, context }): Promise<{ matches: CrmDuplicateLeadMatch[] }> => {
    await requireCrmView(context.supabase, data.companyId);
    const raw = await callRpc<{ matches?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>>(
      context.supabase,
      "find_crm_duplicate_leads",
      {
        _company_id: data.companyId,
        _email: data.email ?? null,
        _phone: data.phone ?? null,
        _organization_name: data.organizationName ?? null,
        _exclude_lead_id: data.excludeLeadId ?? null,
        _limit: 20,
      },
      CRM_GAP_MIGRATION,
    );
    const list = Array.isArray(raw) ? raw : (raw?.matches ?? []);
    return {
      matches: list.map((row) => {
        const match: CrmDuplicateLeadMatch = { id: String(row["id"] ?? "") };
        if (row["leadNumber"] != null) match.leadNumber = String(row["leadNumber"]);
        if (row["lead_number"] != null) match.lead_number = String(row["lead_number"]);
        if (row["email"] != null) match.email = String(row["email"]);
        else match.email = null;
        if (row["status"] != null) match.status = String(row["status"]);
        return match;
      }),
    };
  });

export const findCrmConversionMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; leadId: string }) => ({
    companyId: companyIdOf(input),
    leadId: assertUuid(input.leadId),
  }))
  .handler(async ({ data, context }) => {
    await requireCrmView(context.supabase, data.companyId);
    return callRpc<{
      leadId: string;
      matches: Array<{
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
        kind: string;
        isActive: boolean;
        score: number;
      }>;
    }>(
      context.supabase,
      "find_crm_conversion_matches",
      { _company_id: data.companyId, _lead_id: data.leadId },
      CRM_GAP_MIGRATION,
    );
  });

export const scoreCrmLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; leadId: string; persist?: boolean }) => ({
    companyId: companyIdOf(input),
    leadId: assertUuid(input.leadId),
    persist: input.persist !== false,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "crm.leads.manage");
    return callRpc<{
      leadId: string;
      score: number;
      reasons: Array<{ code: string; points: number; detail: string }>;
      formula: string;
    }>(
      context.supabase,
      "score_crm_lead",
      {
        _company_id: data.companyId,
        _lead_id: data.leadId,
        _persist: data.persist,
      },
      CRM_GAP_MIGRATION,
    );
  });

export const reopenCrmOpportunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; opportunityId: string; stageId?: string; note?: string }) => ({
      companyId: companyIdOf(input),
      opportunityId: assertUuid(input.opportunityId),
      stageId: input.stageId ? assertUuid(input.stageId) : null,
      note: input.note?.trim().slice(0, 400) || undefined,
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "crm.opportunities.manage");
    return callRpc<{ id: string; status: string; stageId: string; version: number }>(
      context.supabase,
      "reopen_crm_opportunity",
      {
        _company_id: data.companyId,
        _opportunity_id: data.opportunityId,
        _stage_id: data.stageId,
        _note: data.note ?? null,
      },
      CRM_GAP_MIGRATION,
    );
  });

export const listCrmPipelines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<{ pipelines: CrmPipeline[]; stages: CrmPipelineStage[] }> => {
    await requireCrmView(context.supabase, data.companyId);
    try {
      await callRpc(context.supabase, "get_crm_settings", { _company_id: data.companyId }, CRM_MIGRATION);
    } catch {
      /* settings seed optional for list */
    }
    const pipelinesRes = await crmClient(context.supabase)
      .from("crm_pipelines")
      .select("*")
      .eq("company_id", data.companyId)
      .order("sort_order", { ascending: true });
    throwIfRelation(pipelinesRes.error);
    const stagesRes = await crmClient(context.supabase)
      .from("crm_pipeline_stages")
      .select("*")
      .eq("company_id", data.companyId)
      .order("sort_order", { ascending: true });
    throwIfRelation(stagesRes.error);
    return {
      pipelines: ((pipelinesRes.data as Record<string, unknown>[] | null) ?? []).map(mapCrmPipeline),
      stages: ((stagesRes.data as Record<string, unknown>[] | null) ?? []).map(mapCrmPipelineStage),
    };
  });

export const listCrmOpportunities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string;
    status?: string;
    pipelineId?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }) => ({
    companyId: companyIdOf(input),
    status: input.status?.trim() || undefined,
    pipelineId: input.pipelineId ? assertUuid(input.pipelineId) : undefined,
    q: (input.q ?? "").trim().slice(0, 120),
    limit: Math.min(Math.max(input.limit ?? 200, 1), 500),
    offset: Number.isSafeInteger(input.offset) && (input.offset ?? 0) >= 0
      ? Math.min(input.offset ?? 0, 1000000)
      : 0,
  }))
  .handler(async ({ data, context }): Promise<CrmOpportunity[]> => {
    await requireCrmView(context.supabase, data.companyId);
    let q = crmClient(context.supabase)
      .from("crm_opportunities")
      .select("*")
      .eq("company_id", data.companyId)
      .is("archived_at", null);
    if (data.status) q = q.eq("status", data.status);
    if (data.pipelineId) q = q.eq("pipeline_id", data.pipelineId);
    const filter = buildIlikeOr(["opportunity_number", "name"], data.q);
    if (filter) q = q.or(filter);
    q = q.order("updated_at", { ascending: false }).order("id", { ascending: false });
    const { data: rows, error } = await q.range(data.offset, data.offset + data.limit - 1);
    throwIfRelation(error);
    return ((rows as Record<string, unknown>[] | null) ?? []).map(mapCrmOpportunity);
  });

export const upsertCrmOpportunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string } & CrmOpportunityDraftInput) => {
    const name = (input.name ?? "").trim();
    if (!name) throw new Error("Opportunity name is required");
    return {
      companyId: companyIdOf(input),
      id: input.id ? assertUuid(input.id) : undefined,
      name: name.slice(0, 200),
      pipelineId: input.pipelineId ? assertUuid(input.pipelineId) : undefined,
      stageId: input.stageId ? assertUuid(input.stageId) : undefined,
      contactId: input.contactId ? assertUuid(input.contactId) : null,
      leadId: input.leadId ? assertUuid(input.leadId) : null,
      ownerUserId: input.ownerUserId ? assertUuid(input.ownerUserId) : undefined,
      amountMinor:
        typeof input.amountMinor === "number" ? Math.max(0, Math.trunc(input.amountMinor)) : 0,
      currencyCode: (input.currencyCode ?? "USD").trim().toUpperCase().slice(0, 3),
      probabilityPct:
        typeof input.probabilityPct === "number"
          ? Math.min(100, Math.max(0, Math.trunc(input.probabilityPct)))
          : undefined,
      expectedCloseDate: input.expectedCloseDate || null,
      priority: input.priority?.trim().slice(0, 20) || "normal",
      sourceId: input.sourceId ? assertUuid(input.sourceId) : null,
      notes: input.notes?.trim().slice(0, 4000) || null,
    };
  })
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "crm.opportunities.manage");
    return callRpc<{ id: string; opportunityNumber: string; status: string; stageId: string }>(
      context.supabase,
      "upsert_crm_opportunity",
      {
        _company_id: data.companyId,
        _payload: {
          id: data.id,
          name: data.name,
          pipelineId: data.pipelineId,
          stageId: data.stageId,
          contactId: data.contactId,
          leadId: data.leadId,
          ownerUserId: data.ownerUserId,
          amountMinor: data.amountMinor,
          currencyCode: data.currencyCode,
          probabilityPct: data.probabilityPct,
          expectedCloseDate: data.expectedCloseDate,
          priority: data.priority,
          sourceId: data.sourceId,
          notes: data.notes,
        },
      },
      CRM_MIGRATION,
    );
  });

export const setCrmOpportunityStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      opportunityId: string;
      stageId: string;
      note?: string;
      expectedVersion?: number;
    }) => ({
      companyId: companyIdOf(input),
      opportunityId: assertUuid(input.opportunityId),
      stageId: assertUuid(input.stageId),
      note: input.note?.trim().slice(0, 400) || undefined,
      expectedVersion:
        typeof input.expectedVersion === "number" ? input.expectedVersion : undefined,
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "crm.opportunities.manage");
    return callRpc<{
      id: string;
      stageId: string;
      status: string;
      probabilityPct: number;
      version: number;
    }>(
      context.supabase,
      "set_crm_opportunity_stage",
      {
        _company_id: data.companyId,
        _opportunity_id: data.opportunityId,
        _stage_id: data.stageId,
        _note: data.note ?? null,
        _expected_version: data.expectedVersion ?? null,
      },
      CRM_GAP_MIGRATION,
    );
  });

export const listCrmActivities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string;
    status?: string;
    kind?: string;
    q?: string;
    dueFrom?: string;
    dueTo?: string;
    limit?: number;
    offset?: number;
  }) => {
    const dueFrom = input.dueFrom?.trim() || undefined;
    const dueTo = input.dueTo?.trim() || undefined;
    if (dueFrom && !Number.isFinite(Date.parse(dueFrom))) throw new Error("Invalid activity start date");
    if (dueTo && !Number.isFinite(Date.parse(dueTo))) throw new Error("Invalid activity end date");
    if (dueFrom && dueTo && new Date(dueFrom) >= new Date(dueTo)) {
      throw new Error("Activity end date must follow start date");
    }
    return {
      companyId: companyIdOf(input),
      status: input.status?.trim() || undefined,
      kind: input.kind?.trim() || undefined,
      q: (input.q ?? "").trim().slice(0, 120),
      dueFrom,
      dueTo,
      limit: Math.min(Math.max(input.limit ?? 100, 1), 500),
      offset: Number.isSafeInteger(input.offset) && (input.offset ?? 0) >= 0
        ? Math.min(input.offset ?? 0, 1000000)
        : 0,
    };
  })
  .handler(async ({ data, context }): Promise<CrmActivity[]> => {
    await requireCrmView(context.supabase, data.companyId);
    let q = crmClient(context.supabase)
      .from("crm_activities")
      .select("*")
      .eq("company_id", data.companyId);
    if (data.status) q = q.eq("status", data.status);
    if (data.kind) q = q.eq("kind", data.kind);
    const subjectFilter = buildIlikeOr(["subject"], data.q);
    if (subjectFilter) q = q.or(subjectFilter);
    if (data.dueFrom) q = q.gte("due_at", data.dueFrom);
    if (data.dueTo) q = q.lt("due_at", data.dueTo);
    q = q.order("due_at", { ascending: true }).order("id", { ascending: true });
    const { data: rows, error } = await q.range(data.offset, data.offset + data.limit - 1);
    throwIfRelation(error);
    return ((rows as Record<string, unknown>[] | null) ?? []).map(mapCrmActivity);
  });

export const upsertCrmActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      id?: string;
      kind?: string;
      subject: string;
      body?: string;
      priority?: string;
      ownerUserId?: string;
      dueAt?: string | null;
      remindAt?: string | null;
      leadId?: string | null;
      opportunityId?: string | null;
      contactId?: string | null;
    }) => {
      const subject = (input.subject ?? "").trim();
      if (!subject) throw new Error("Activity subject is required");
      if (!input.leadId && !input.opportunityId && !input.contactId) {
        throw new Error("Link the activity to a lead, opportunity or contact.");
      }
      return {
        companyId: companyIdOf(input),
        id: input.id ? assertUuid(input.id) : undefined,
        kind: input.kind?.trim() || "task",
        subject: subject.slice(0, 200),
        body: input.body?.trim().slice(0, 4000) || undefined,
        priority: input.priority?.trim() || "normal",
        ownerUserId: input.ownerUserId ? assertUuid(input.ownerUserId) : undefined,
        dueAt: input.dueAt || null,
        remindAt: input.remindAt || null,
        leadId: input.leadId ? assertUuid(input.leadId) : null,
        opportunityId: input.opportunityId ? assertUuid(input.opportunityId) : null,
        contactId: input.contactId ? assertUuid(input.contactId) : null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "crm.activities.manage");
    return callRpc<{ id: string; status: string }>(
      context.supabase,
      "upsert_crm_activity",
      {
        _company_id: data.companyId,
        _payload: {
          id: data.id,
          kind: data.kind,
          subject: data.subject,
          body: data.body,
          priority: data.priority,
          ownerUserId: data.ownerUserId,
          dueAt: data.dueAt,
          remindAt: data.remindAt,
          leadId: data.leadId,
          opportunityId: data.opportunityId,
          contactId: data.contactId,
        },
      },
      CRM_MIGRATION,
    );
  });

export const completeCrmActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; activityId: string }) => ({
    companyId: companyIdOf(input),
    activityId: assertUuid(input.activityId),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "crm.activities.manage");
    return callRpc<{ id: string; status: string; completedAt: string }>(
      context.supabase,
      "complete_crm_activity",
      { _company_id: data.companyId, _activity_id: data.activityId },
      CRM_MIGRATION,
    );
  });

export const listCrmLeadSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<CrmLeadSource[]> => {
    await requireCrmView(context.supabase, data.companyId);
    try {
      await callRpc(context.supabase, "get_crm_settings", { _company_id: data.companyId }, CRM_MIGRATION);
    } catch {
      /* ignore */
    }
    const { data: rows, error } = await crmClient(context.supabase)
      .from("crm_lead_sources")
      .select("*")
      .eq("company_id", data.companyId)
      .order("sort_order", { ascending: true });
    throwIfRelation(error);
    return ((rows as Record<string, unknown>[] | null) ?? []).map(mapCrmLeadSource);
  });

/**
 * CRM people directory is a read-only Contacts overlay, not a second CRM
 * person master. Both queries enforce tenant identity and run through RLS.
 * Supplier-only people are explicitly excluded from CRM results.
 */
export const listCrmContactPeople = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: companyIdOf(input),
  }))
  .handler(async ({ data, context }): Promise<CrmPersonDirectoryRow[]> => {
    await requireCrmView(context.supabase, data.companyId);
    const { data: customers, error: customerError } = await context.supabase
      .from("contacts" as never)
      .select("id, name" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("is_active" as never, true as never)
      .is("archived_at" as never, null as never)
      .in("kind" as never, ["customer", "both"] as never)
      .order("name" as never, { ascending: true })
      .limit(200);
    throwIfRelation(customerError as { message: string; code?: string } | null);

    const accounts = ((customers as Array<Record<string, unknown>> | null) ?? []).map((row) => ({
      id: String(row["id"] ?? ""),
      name: String(row["name"] ?? ""),
    }));
    if (accounts.length === 0) return [];

    const { data: people, error: peopleError } = await context.supabase
      .from("contact_people" as never)
      .select("id, contact_id, first_name, last_name, email, phone, job_title, role_label, is_primary" as never)
      .eq("company_id" as never, data.companyId as never)
      .in("contact_id" as never, accounts.map((account) => account.id) as never)
      .order("first_name" as never, { ascending: true })
      .limit(500);
    throwIfRelation(peopleError as { message: string; code?: string } | null);

    const typedPeople: CrmAccountPerson[] = ((people as Array<Record<string, unknown>> | null) ?? []).map((row) => ({
      id: String(row["id"] ?? ""),
      contactId: String(row["contact_id"] ?? ""),
      firstName: row["first_name"] == null ? null : String(row["first_name"]),
      lastName: row["last_name"] == null ? null : String(row["last_name"]),
      email: row["email"] == null ? null : String(row["email"]),
      phone: row["phone"] == null ? null : String(row["phone"]),
      jobTitle: row["job_title"] == null ? null : String(row["job_title"]),
      roleLabel: row["role_label"] == null ? null : String(row["role_label"]),
      isPrimary: Boolean(row["is_primary"]),
    }));
    return buildCrmPersonDirectory(typedPeople, accounts);
  });

export const listCrmAccountOverlay = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; q?: string; crmOnly?: boolean; limit?: number }) => ({
    companyId: companyIdOf(input),
    q: (input.q ?? "").trim().slice(0, 100),
    crmOnly: Boolean(input.crmOnly),
    limit: Math.min(Math.max(input.limit ?? 200, 1), 500),
  }))
  .handler(async ({ data, context }): Promise<CrmAccountOverlayRow[]> => {
    await requireCrmView(context.supabase, data.companyId);
    // Contacts remain the customer master; CRM only attaches pipeline facts.
    let contactsQ = context.supabase
      .from("contacts" as never)
      .select("id, name, email, phone, kind, is_active" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("is_active" as never, true as never)
      .is("archived_at" as never, null as never)
      .in("kind" as never, ["customer", "both"] as never)
      .order("name" as never, { ascending: true })
      .limit(data.limit);
    if (data.q) {
      const pattern = `%${data.q.replace(/[%_,]/g, "")}%`;
      contactsQ = contactsQ.or(
        `name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}` as never,
      );
    }
    const contactsRes = await contactsQ;
    throwIfRelation(contactsRes.error as { message: string; code?: string } | null);

    const [leadsRes, oppsRes] = await Promise.all([
      crmClient(context.supabase)
        .from("crm_leads")
        .select("id, contact_id, status")
        .eq("company_id", data.companyId)
        .is("archived_at", null)
        .not("contact_id", "is", null)
        .limit(2000),
      crmClient(context.supabase)
        .from("crm_opportunities")
        .select("id, contact_id, status, amount_minor, currency_code")
        .eq("company_id", data.companyId)
        .is("archived_at", null)
        .not("contact_id", "is", null)
        .limit(2000),
    ]);
    throwIfRelation(leadsRes.error);
    throwIfRelation(oppsRes.error);

    const contacts = ((contactsRes.data as Array<Record<string, unknown>> | null) ?? []).map(
      (row) => ({
        id: String(row["id"] ?? ""),
        name: String(row["name"] ?? ""),
        email: row["email"] == null ? null : String(row["email"]),
        phone: row["phone"] == null ? null : String(row["phone"]),
        kind: String(row["kind"] ?? "customer"),
        isActive: Boolean(row["is_active"]),
      }),
    );
    const leads = ((leadsRes.data as Array<Record<string, unknown>> | null) ?? []).map((row) => ({
      id: String(row["id"] ?? ""),
      contactId: row["contact_id"] == null ? null : String(row["contact_id"]),
      status: String(row["status"] ?? ""),
    }));
    const opportunities = ((oppsRes.data as Array<Record<string, unknown>> | null) ?? []).map(
      (row) => ({
        id: String(row["id"] ?? ""),
        contactId: row["contact_id"] == null ? null : String(row["contact_id"]),
        status: String(row["status"] ?? ""),
        amountMinor: Number(row["amount_minor"] ?? 0) || 0,
        currencyCode: String(row["currency_code"] ?? "UNKNOWN"),
      }),
    );

    const rows = buildCrmAccountOverlay({ contacts, leads, opportunities });
    return data.crmOnly ? rows.filter((r) => r.hasCrmActivity) : rows;
  });


async function resolveCrmQuoteIncomeAccount(
  supabase: unknown,
  companyId: string,
  contactId: string,
): Promise<string> {
  const contactRes = await (supabase as any)
    .from("contacts")
    .select("default_sales_account_id")
    .eq("company_id", companyId)
    .eq("id", contactId)
    .maybeSingle();
  if (contactRes.error) throw new Error(contactRes.error.message);
  const preferred = contactRes.data?.default_sales_account_id as string | null | undefined;
  if (preferred) return preferred;

  const acctRes = await (supabase as any)
    .from("accounts")
    .select("id")
    .eq("company_id", companyId)
    .eq("account_type", "income")
    .eq("is_active", true)
    .eq("is_postable", true)
    .is("archived_at", null)
    .order("code", { ascending: true })
    .limit(1);
  if (acctRes.error) throw new Error(acctRes.error.message);
  const id = (acctRes.data?.[0] as { id?: string } | undefined)?.id;
  if (!id) {
    throw new Error(
      "No active postable income account is available. Set a default sales account on the contact or chart of accounts.",
    );
  }
  return id;
}

/**
 * Creates a Sales quote draft from a CRM opportunity and links opportunity.quote_id.
 * GL posting remains in Sales — this path only drafts a quote.
 */
export const createCrmOpportunityQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; opportunityId: string }) => ({
    companyId: companyIdOf(input),
    opportunityId: assertUuid(input.opportunityId),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCompanyPermission(supabase, data.companyId, "crm.opportunities.manage");
    await assertCompanyPermission(supabase, data.companyId, "sales.draft");

    const { data: row, error } = await crmClient(supabase)
      .from("crm_opportunities")
      .select("*")
      .eq("company_id", data.companyId)
      .eq("id", data.opportunityId)
      .maybeSingle();
    throwIfRelation(error);
    if (!row) throw new Error("Opportunity not found");
    const opp = mapCrmOpportunity(row as Record<string, unknown>);
    if (opp.quoteId) {
      return { quoteId: opp.quoteId, created: false as const, opportunityId: opp.id };
    }
    if (!opp.contactId) {
      throw new Error("Link a customer Contact on the opportunity before creating a quote.");
    }
    if (opp.amountMinor <= 0) {
      throw new Error("Set a positive opportunity amount before creating a quote.");
    }

    const accountId = await resolveCrmQuoteIncomeAccount(supabase, data.companyId, opp.contactId);
    const defaults = await loadCompanyDefaults(supabase as never, data.companyId);
    const { currencyCode, fxRateToBase } = normaliseCurrencyAndFx(
      opp.currencyCode,
      defaults.baseCurrency,
      1,
    );
    const line = buildOpportunityQuoteLine({
      opportunityName: opp.name,
      opportunityNumber: opp.opportunityNumber,
      amountMinor: opp.amountMinor,
      accountId,
    });
    const lines = await prepareSalesLines(supabase as never, data.companyId, [line], defaults.today);
    const saved = await saveSalesDocument(supabase as never, {
      kind: "quote",
      companyId: data.companyId,
      userId,
      contactId: opp.contactId,
      docDate: defaults.today,
      memo: `CRM opportunity ${opp.opportunityNumber}`,
      currencyCode,
      fxRateToBase,
      lines,
    });

    const upd = await (supabase as any)
      .from("crm_opportunities")
      .update({ quote_id: saved.id, updated_at: new Date().toISOString(), updated_by: userId })
      .eq("company_id", data.companyId)
      .eq("id", opp.id)
      .is("quote_id", null)
      .select("id");
    if (upd.error) throw new Error(upd.error.message);
    if (!upd.data?.length) {
      // Concurrent create — return existing link if set
      const again = await crmClient(supabase)
        .from("crm_opportunities")
        .select("quote_id")
        .eq("company_id", data.companyId)
        .eq("id", opp.id)
        .maybeSingle();
      throwIfRelation(again.error);
      const existing = (again.data as { quote_id?: string } | null)?.quote_id;
      if (existing) return { quoteId: existing, created: false as const, opportunityId: opp.id };
      throw new Error("Could not link the quote to the opportunity. Refresh and try again.");
    }

    return { quoteId: saved.id, quoteNumber: saved.number, created: true as const, opportunityId: opp.id };
  });

export const upsertCrmPipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      id?: string;
      name: string;
      description?: string | null;
      isDefault?: boolean;
      isActive?: boolean;
      sortOrder?: number;
    }) => {
      const name = (input.name ?? "").trim();
      if (!name) throw new Error("Pipeline name is required");
      return {
        companyId: companyIdOf(input),
        id: input.id ? assertUuid(input.id) : undefined,
        name: name.slice(0, 120),
        description: input.description?.trim().slice(0, 500) || null,
        isDefault: Boolean(input.isDefault),
        isActive: input.isActive !== false,
        sortOrder:
          typeof input.sortOrder === "number"
            ? Math.min(100000, Math.max(0, Math.trunc(input.sortOrder)))
            : 100,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "crm.admin");
    return callRpc<{
      id: string;
      name: string;
      description: string | null;
      isDefault: boolean;
      isActive: boolean;
      sortOrder: number;
    }>(
      context.supabase,
      "upsert_crm_pipeline",
      {
        _company_id: data.companyId,
        _payload: {
          id: data.id,
          name: data.name,
          description: data.description,
          isDefault: data.isDefault,
          isActive: data.isActive,
          sortOrder: data.sortOrder,
        },
      },
      CRM_PIPELINE_ADMIN_MIGRATION,
    );
  });

export const upsertCrmPipelineStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      id?: string;
      pipelineId: string;
      name: string;
      probabilityPct: number;
      sortOrder?: number;
      isWon?: boolean;
      isLost?: boolean;
      isActive?: boolean;
    }) => {
      const name = (input.name ?? "").trim();
      if (!name) throw new Error("Stage name is required");
      const isWon = Boolean(input.isWon);
      const isLost = Boolean(input.isLost);
      if (isWon && isLost) throw new Error("Stage cannot be both won and lost");
      return {
        companyId: companyIdOf(input),
        id: input.id ? assertUuid(input.id) : undefined,
        pipelineId: assertUuid(input.pipelineId),
        name: name.slice(0, 120),
        probabilityPct: Math.min(100, Math.max(0, Math.trunc(input.probabilityPct))),
        sortOrder:
          typeof input.sortOrder === "number"
            ? Math.min(100000, Math.max(0, Math.trunc(input.sortOrder)))
            : 100,
        isWon,
        isLost,
        isActive: input.isActive !== false,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "crm.admin");
    return callRpc<{
      id: string;
      pipelineId: string;
      name: string;
      probabilityPct: number;
      sortOrder: number;
      isWon: boolean;
      isLost: boolean;
      isActive: boolean;
    }>(
      context.supabase,
      "upsert_crm_pipeline_stage",
      {
        _company_id: data.companyId,
        _payload: {
          id: data.id,
          pipelineId: data.pipelineId,
          name: data.name,
          probabilityPct: data.probabilityPct,
          sortOrder: data.sortOrder,
          isWon: data.isWon,
          isLost: data.isLost,
          isActive: data.isActive,
        },
      },
      CRM_PIPELINE_ADMIN_MIGRATION,
    );
  });

/**
 * Read-only Sales invoice status for CRM opportunities that already have a linked quote.
 * Requires sales.view so CRM never leaks AR without Sales permission.
 */
export const listCrmDealInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; limit?: number }) => ({
    companyId: companyIdOf(input),
    limit: Math.min(Math.max(input.limit ?? 100, 1), 300),
  }))
  .handler(async ({ data, context }): Promise<CrmDealInvoiceRow[]> => {
    await requireCrmView(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "sales.view");

    const oppsRes = await crmClient(context.supabase)
      .from("crm_opportunities")
      .select("id, opportunity_number, name, quote_id")
      .eq("company_id", data.companyId)
      .not("quote_id", "is", null)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    throwIfRelation(oppsRes.error);

    const opps = (oppsRes.data as Array<{
      id: string;
      opportunity_number: string;
      name: string;
      quote_id: string;
    }> | null) ?? [];
    if (opps.length === 0) return [];

    const quoteIds = [...new Set(opps.map((o) => o.quote_id))];
    const quotesRes = await (context.supabase as any)
      .from("sales_quotes")
      .select("id, quote_number, converted_invoice_id")
      .eq("company_id", data.companyId)
      .in("id", quoteIds);
    if (quotesRes.error) throw new Error(quotesRes.error.message);
    const quotes = new Map<
      string,
      { id: string; quote_number: string; converted_invoice_id: string | null }
    >();
    for (const q of (quotesRes.data as Array<{
      id: string;
      quote_number: string;
      converted_invoice_id: string | null;
    }> | null) ?? []) {
      quotes.set(q.id, q);
    }

    const invoiceIds = [
      ...new Set(
        [...quotes.values()]
          .map((q) => q.converted_invoice_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const invoices = new Map<
      string,
      {
        id: string;
        invoice_number: string;
        status: string;
        currency_code: string;
        total_minor: number;
        amount_paid_minor: number;
        amount_credited_minor: number;
        due_date: string;
      }
    >();
    if (invoiceIds.length > 0) {
      const invRes = await (context.supabase as any)
        .from("sales_invoices")
        .select(
          "id, invoice_number, status, currency_code, total_minor, amount_paid_minor, amount_credited_minor, due_date",
        )
        .eq("company_id", data.companyId)
        .in("id", invoiceIds);
      if (invRes.error) throw new Error(invRes.error.message);
      for (const inv of (invRes.data as Array<{
        id: string;
        invoice_number: string;
        status: string;
        currency_code: string;
        total_minor: number;
        amount_paid_minor: number;
        amount_credited_minor: number;
        due_date: string;
      }> | null) ?? []) {
        invoices.set(inv.id, inv);
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    return opps.map((opp) => {
      const quote = quotes.get(opp.quote_id);
      const invoice = quote?.converted_invoice_id
        ? invoices.get(quote.converted_invoice_id) ?? null
        : null;
      return buildCrmDealInvoiceRow({
        opportunityId: opp.id,
        opportunityNumber: opp.opportunity_number,
        opportunityName: opp.name,
        quoteId: opp.quote_id,
        quoteNumber: quote?.quote_number ?? null,
        invoice,
        today,
      });
    });
  });

/** Stage-weighted CRM forecast — expectation only; not GL revenue. */
export const getCrmForecastReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; pipelineId?: string }) => ({
    companyId: companyIdOf(input),
    pipelineId: input.pipelineId ? assertUuid(input.pipelineId) : undefined,
  }))
  .handler(async ({ data, context }): Promise<ForecastReport> => {
    await requireCrmView(context.supabase, data.companyId);

    const pipelinesRes = await crmClient(context.supabase)
      .from("crm_pipelines")
      .select("*")
      .eq("company_id", data.companyId)
      .order("sort_order", { ascending: true });
    throwIfRelation(pipelinesRes.error);
    const pipelines = ((pipelinesRes.data as Record<string, unknown>[] | null) ?? []).map(
      mapCrmPipeline,
    );
    const pipeline =
      (data.pipelineId ? pipelines.find((p) => p.id === data.pipelineId) : null) ??
      pipelines.find((p) => p.isDefault) ??
      pipelines[0] ??
      null;

    const stagesRes = await crmClient(context.supabase)
      .from("crm_pipeline_stages")
      .select("*")
      .eq("company_id", data.companyId)
      .order("sort_order", { ascending: true });
    throwIfRelation(stagesRes.error);
    const allStages = ((stagesRes.data as Record<string, unknown>[] | null) ?? []).map(
      mapCrmPipelineStage,
    );
    const stages = pipeline
      ? allStages.filter((s) => s.pipelineId === pipeline.id)
      : allStages;

    let oppQ = crmClient(context.supabase)
      .from("crm_opportunities")
      .select("*")
      .eq("company_id", data.companyId)
      .eq("status", "open")
      .is("archived_at", null)
      .order("updated_at", { ascending: false });
    if (pipeline) oppQ = oppQ.eq("pipeline_id", pipeline.id);
    const oppsRes = await oppQ.limit(500);
    throwIfRelation(oppsRes.error);
    const opportunities = ((oppsRes.data as Record<string, unknown>[] | null) ?? []).map(
      mapCrmOpportunity,
    );

    return buildForecastReport({
      opportunities: opportunities.map((o) => ({
        id: o.id,
        stageId: o.stageId,
        amountMinor: o.amountMinor,
        probabilityPct: o.probabilityPct,
        status: o.status,
      })),
      stages: stages.map((s) => ({
        id: s.id,
        name: s.name,
        sortOrder: s.sortOrder,
        probabilityPct: s.probabilityPct,
        isWon: s.isWon,
        isLost: s.isLost,
        isActive: s.isActive,
      })),
    });
  });

/** Honest outbound-comms gate — always fail-closed until a provider is wired. */
export const getCrmCommsPolicy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<CrmCommsPolicy> => {
    await requireCrmView(context.supabase, data.companyId);
    // Provider wiring is intentionally absent: never claim send is available.
    return resolveCrmCommsPolicy({ providerConfigured: false });
  });

/** Automation engine gate — flagged off until durable runners exist. */
export const getCrmAutomationPolicy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<CrmAutomationPolicy> => {
    await assertCompanyPermission(context.supabase, data.companyId, "crm.automation.manage");
    return resolveCrmAutomationPolicy({ engineEnabled: false });
  });

/** Import/export gate — permissions alone never unlock unbacked data moves. */
export const getCrmImportExportPolicy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<CrmImportExportPolicy & { hasImportPermission: boolean; hasExportPermission: boolean }> => {
    await assertCompanyMember(context.supabase, data.companyId);
    let hasImportPermission = false;
    let hasExportPermission = false;
    try {
      await assertCompanyPermission(context.supabase, data.companyId, "crm.import");
      hasImportPermission = true;
    } catch {
      /* optional */
    }
    try {
      await assertCompanyPermission(context.supabase, data.companyId, "crm.export");
      hasExportPermission = true;
    } catch {
      /* optional */
    }
    if (!hasImportPermission && !hasExportPermission) {
      await assertCompanyPermission(context.supabase, data.companyId, "crm.admin");
      hasImportPermission = true;
      hasExportPermission = true;
    }
    const policy = resolveCrmImportExportPolicy({
      backendReady: false,
      hasImportPermission,
      hasExportPermission,
    });
    return { ...policy, hasImportPermission, hasExportPermission };
  });

export const getCrmTerritoryPolicy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<CrmTerritoryPolicy> => {
    await assertCompanyPermission(context.supabase, data.companyId, "crm.admin");
    return resolveCrmTerritoryPolicy({ backendReady: true });
  });

export const getCrmPublicFormsPolicy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<CrmPublicFormsPolicy> => {
    await assertCompanyPermission(context.supabase, data.companyId, "crm.admin");
    return resolveCrmPublicFormsPolicy({ intakeReady: false });
  });

/** Company members with CRM ownership workload (leads/opps). Territories remain gated. */
export const listCrmTeamWorkload = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ members: CrmTeamWorkloadRow[]; territory: CrmTerritoryPolicy }> => {
      await assertCompanyPermission(context.supabase, data.companyId, "crm.admin");
      const { supabase, userId } = context;

      const membersRes = await (supabase as any)
        .from("company_members")
        .select("user_id, role, status")
        .eq("company_id", data.companyId)
        .order("created_at");
      if (membersRes.error) throw new Error(membersRes.error.message);
      const memberRows = (membersRes.data as Array<{
        user_id: string;
        role: string;
        status: string;
      }> | null) ?? [];
      const ids = memberRows.map((r) => r.user_id);
      const profilesRes = ids.length
        ? await (supabase as any).from("profiles").select("id, full_name, email").in("id", ids)
        : { data: [], error: null };
      if (profilesRes.error) throw new Error(profilesRes.error.message);
      const byId = new Map(
        ((profilesRes.data as Array<{ id: string; full_name: string; email: string }> | null) ?? []).map(
          (p) => [p.id, p],
        ),
      );

      const leadsRes = await crmClient(supabase)
        .from("crm_leads")
        .select("owner_user_id")
        .eq("company_id", data.companyId)
        .is("archived_at", null)
        .limit(2000);
      throwIfRelation(leadsRes.error);

      const oppsRes = await crmClient(supabase)
        .from("crm_opportunities")
        .select("owner_user_id")
        .eq("company_id", data.companyId)
        .eq("status", "open")
        .is("archived_at", null)
        .limit(2000);
      throwIfRelation(oppsRes.error);

      const members = buildCrmTeamWorkload({
        members: memberRows.map((r) => ({
          userId: r.user_id,
          fullName: byId.get(r.user_id)?.full_name ?? "",
          email: byId.get(r.user_id)?.email ?? "",
          role: r.role,
          status: r.status,
          isYou: r.user_id === userId,
        })),
        leads: ((leadsRes.data as Array<{ owner_user_id: string | null }> | null) ?? []).map((r) => ({
          ownerUserId: r.owner_user_id,
        })),
        opportunities: (
          (oppsRes.data as Array<{ owner_user_id: string | null }> | null) ?? []
        ).map((r) => ({ ownerUserId: r.owner_user_id })),
      });

      return {
        members,
        territory: resolveCrmTerritoryPolicy({ backendReady: true }),
      };
    },
  );

export const listCrmCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; limit?: number }) => ({
    companyId: companyIdOf(input),
    limit: Math.min(Math.max(input.limit ?? 200, 1), 500),
  }))
  .handler(async ({ data, context }): Promise<CrmCampaign[]> => {
    await requireCrmView(context.supabase, data.companyId);
    const { data: rows, error } = await crmClient(context.supabase)
      .from("crm_campaigns")
      .select("*")
      .eq("company_id", data.companyId)
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (error) {
      if (isMissingRelation(error)) throw new Error(CRM_CAMPAIGNS_MIGRATION);
      throw new Error(error.message);
    }
    return ((rows as Record<string, unknown>[] | null) ?? []).map(mapCrmCampaign);
  });

export const upsertCrmCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      id?: string;
      name: string;
      code?: string | null;
      status?: CrmCampaignStatus;
      channel?: string | null;
      sourceId?: string | null;
      startsOn?: string | null;
      endsOn?: string | null;
      budgetMinor?: number;
      currencyCode?: string;
      notes?: string | null;
      isActive?: boolean;
    }) => {
      const status = (input.status ?? "planned") as CrmCampaignStatus;
      if (!CRM_CAMPAIGN_STATUSES.includes(status)) throw new Error("Invalid campaign status");
      const draftError = validateCrmCampaignDraft({
        name: input.name ?? "",
        status,
        budgetMinor: typeof input.budgetMinor === "number" ? input.budgetMinor : 0,
        currencyCode: input.currencyCode ?? "USD",
        startsOn: input.startsOn ?? null,
        endsOn: input.endsOn ?? null,
      });
      if (draftError) throw new Error(draftError);
      return {
        companyId: companyIdOf(input),
        id: input.id ? assertUuid(input.id) : undefined,
        name: input.name.trim().slice(0, 160),
        code: input.code?.trim().slice(0, 40) || null,
        status,
        channel: input.channel?.trim().slice(0, 80) || null,
        sourceId: input.sourceId ? assertUuid(input.sourceId) : null,
        startsOn: input.startsOn || null,
        endsOn: input.endsOn || null,
        budgetMinor: Math.max(0, Math.trunc(input.budgetMinor ?? 0)),
        currencyCode: (input.currencyCode ?? "USD").trim().toUpperCase().slice(0, 3),
        notes: input.notes?.trim().slice(0, 4000) || null,
        isActive: input.isActive !== false,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "crm.campaigns.manage");
    return callRpc<Record<string, unknown>>(
      context.supabase,
      "upsert_crm_campaign",
      {
        _company_id: data.companyId,
        _payload: {
          id: data.id,
          name: data.name,
          code: data.code,
          status: data.status,
          channel: data.channel,
          sourceId: data.sourceId,
          startsOn: data.startsOn,
          endsOn: data.endsOn,
          budgetMinor: data.budgetMinor,
          currencyCode: data.currencyCode,
          notes: data.notes,
          isActive: data.isActive,
        },
      },
      CRM_CAMPAIGNS_MIGRATION,
    ).then((raw) => mapCrmCampaign({
      id: (raw as { id?: string }).id,
      name: (raw as { name?: string }).name,
      code: (raw as { code?: string | null }).code,
      status: (raw as { status?: CrmCampaignStatus }).status,
      channel: (raw as { channel?: string | null }).channel,
      source_id: (raw as { sourceId?: string | null }).sourceId,
      starts_on: (raw as { startsOn?: string | null }).startsOn,
      ends_on: (raw as { endsOn?: string | null }).endsOn,
      budget_minor: (raw as { budgetMinor?: number }).budgetMinor,
      currency_code: (raw as { currencyCode?: string }).currencyCode,
      notes: (raw as { notes?: string | null }).notes,
      is_active: (raw as { isActive?: boolean }).isActive,
    }));
  });

export const listCrmTerritories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<CrmTerritory[]> => {
    await requireCrmView(context.supabase, data.companyId);
    const { data: rows, error } = await crmClient(context.supabase)
      .from("crm_territories")
      .select("*")
      .eq("company_id", data.companyId)
      .order("sort_order", { ascending: true })
      .limit(500);
    if (error) {
      if (isMissingRelation(error)) throw new Error(CRM_TERRITORIES_MIGRATION);
      throw new Error(error.message);
    }
    return ((rows as Record<string, unknown>[] | null) ?? []).map(mapCrmTerritory);
  });

export const upsertCrmTerritory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      id?: string;
      name: string;
      code?: string | null;
      description?: string | null;
      ownerUserId?: string | null;
      isActive?: boolean;
      sortOrder?: number;
    }) => {
      const error = validateCrmTerritoryDraft({
        name: input.name ?? "",
        sortOrder: typeof input.sortOrder === "number" ? input.sortOrder : 100,
      });
      if (error) throw new Error(error);
      return {
        companyId: companyIdOf(input),
        id: input.id ? assertUuid(input.id) : undefined,
        name: input.name.trim().slice(0, 120),
        code: input.code?.trim().slice(0, 40) || null,
        description: input.description?.trim().slice(0, 500) || null,
        ownerUserId: input.ownerUserId ? assertUuid(input.ownerUserId) : null,
        isActive: input.isActive !== false,
        sortOrder:
          typeof input.sortOrder === "number"
            ? Math.min(100000, Math.max(0, Math.trunc(input.sortOrder)))
            : 100,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "crm.admin");
    const raw = await callRpc<Record<string, unknown>>(
      context.supabase,
      "upsert_crm_territory",
      {
        _company_id: data.companyId,
        _payload: {
          id: data.id,
          name: data.name,
          code: data.code,
          description: data.description,
          ownerUserId: data.ownerUserId,
          isActive: data.isActive,
          sortOrder: data.sortOrder,
        },
      },
      CRM_TERRITORIES_MIGRATION,
    );
    return mapCrmTerritory({
      id: raw["id"] as string,
      name: raw["name"] as string,
      code: (raw["code"] as string | null) ?? null,
      description: (raw["description"] as string | null) ?? null,
      owner_user_id: (raw["ownerUserId"] as string | null) ?? null,
      is_active: raw["isActive"] as boolean,
      sort_order: raw["sortOrder"] as number,
    });
  });
