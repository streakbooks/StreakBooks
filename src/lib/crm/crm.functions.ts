import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { callRpc, companyIdOf, isMissingRelation } from "@/lib/planning/rpc";
import {
  mapCrmActivity,
  mapCrmDashboardKpis,
  mapCrmLead,
  mapCrmLeadSource,
  mapCrmOpportunity,
  mapCrmPipeline,
  mapCrmPipelineStage,
  mapCrmSettings,
} from "@/lib/crm/mappers";
import { crmClient } from "@/lib/crm/query";
import type {
  CrmActivity,
  CrmDashboardKpis,
  CrmLead,
  CrmLeadDraftInput,
  CrmLeadSource,
  CrmOpportunity,
  CrmOpportunityDraftInput,
  CrmPipeline,
  CrmPipelineStage,
  CrmSettings,
} from "@/lib/crm/types";
import { emptyCrmDashboardKpis } from "@/lib/crm/types";

export const CRM_MIGRATION =
  "CRM is not available yet: the database update 20261109120000 has not been applied.";

export const CRM_GAP_MIGRATION =
  "CRM gap-closure features need database update 20261109130000 (duplicate matching, scoring, reopen).";

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
  .inputValidator((input: { companyId: string; status?: string; limit?: number }) => ({
    companyId: companyIdOf(input),
    status: input.status?.trim() || undefined,
    limit: Math.min(Math.max(input.limit ?? 100, 1), 500),
  }))
  .handler(async ({ data, context }): Promise<CrmLead[]> => {
    await requireCrmView(context.supabase, data.companyId);
    let q = crmClient(context.supabase)
      .from("crm_leads")
      .select("*")
      .eq("company_id", data.companyId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false });
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q.limit(data.limit);
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

export const findCrmDuplicateLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      email?: string;
      phone?: string;
      organizationName?: string;
      excludeLeadId?: string;
    }) => ({
      companyId: companyIdOf(input),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      organizationName: input.organizationName?.trim() || null,
      excludeLeadId: input.excludeLeadId ? assertUuid(input.excludeLeadId) : null,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireCrmView(context.supabase, data.companyId);
    return callRpc<{ matches: Array<Record<string, unknown>> }>(
      context.supabase,
      "find_crm_duplicate_leads",
      {
        _company_id: data.companyId,
        _email: data.email,
        _phone: data.phone,
        _organization_name: data.organizationName,
        _exclude_lead_id: data.excludeLeadId,
        _limit: 20,
      },
      CRM_GAP_MIGRATION,
    );
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
  .inputValidator((input: { companyId: string; status?: string; limit?: number }) => ({
    companyId: companyIdOf(input),
    status: input.status?.trim() || undefined,
    limit: Math.min(Math.max(input.limit ?? 200, 1), 500),
  }))
  .handler(async ({ data, context }): Promise<CrmOpportunity[]> => {
    await requireCrmView(context.supabase, data.companyId);
    let q = crmClient(context.supabase)
      .from("crm_opportunities")
      .select("*")
      .eq("company_id", data.companyId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false });
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q.limit(data.limit);
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
  .inputValidator((input: { companyId: string; status?: string; limit?: number }) => ({
    companyId: companyIdOf(input),
    status: input.status?.trim() || undefined,
    limit: Math.min(Math.max(input.limit ?? 100, 1), 500),
  }))
  .handler(async ({ data, context }): Promise<CrmActivity[]> => {
    await requireCrmView(context.supabase, data.companyId);
    let q = crmClient(context.supabase)
      .from("crm_activities")
      .select("*")
      .eq("company_id", data.companyId)
      .order("due_at", { ascending: true });
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q.limit(data.limit);
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
