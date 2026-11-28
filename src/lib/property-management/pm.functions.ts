import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { companyIdOf, callRpc } from "@/lib/planning/rpc";
import {
  mapPmDashboardKpis,
  mapPmManagementAgreement,
  mapPmOwner,
  mapPmOwnership,
  mapPmProperty,
  mapPmSettings,
  mapPmUnit,
} from "@/lib/property-management/mappers";
import type {
  PmDashboardKpis,
  PmManagementAgreement,
  PmManagementAgreementDraft,
  PmOwner,
  PmOwnerDraft,
  PmOwnership,
  PmOwnershipDraft,
  PmProperty,
  PmPropertyDraft,
  PmSettings,
  PmUnit,
  PmUnitDraft,
} from "@/lib/property-management/types";
import { emptyPmDashboardKpis } from "@/lib/property-management/types";

export const PM_MIGRATION =
  "Property Management is not available yet: database update 20261118150000 has not been applied.";

/**
 * Prefer RPC permission checks. Pre-asserting property.* before the migration is
 * applied returns a generic deny while the client catalogue already shows the
 * module — callRpc then surfaces the migration message instead.
 */
async function requirePmMember(supabase: unknown, companyId: string) {
  await assertCompanyMember(supabase as never, companyId);
}

export const getPmSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<PmSettings> => {
    await requirePmMember(context.supabase, data.companyId);
    const raw = await callRpc<unknown>(
      context.supabase,
      "get_pm_settings",
      { _company_id: data.companyId },
      PM_MIGRATION,
    );
    return mapPmSettings(raw);
  });

export const upsertPmSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      enabled: boolean;
      defaultRentalMode: PmSettings["defaultRentalMode"];
      defaultBusinessModel: PmSettings["defaultBusinessModel"];
      propertyNumberPrefix: string;
      requireOwnershipHundredPct: boolean;
      expectedVersion: number;
    }) => ({
      companyId: companyIdOf(input),
      enabled: Boolean(input.enabled),
      defaultRentalMode: input.defaultRentalMode,
      defaultBusinessModel: input.defaultBusinessModel,
      propertyNumberPrefix: String(input.propertyNumberPrefix ?? "PROP-").trim(),
      requireOwnershipHundredPct: Boolean(input.requireOwnershipHundredPct),
      expectedVersion: Number(input.expectedVersion),
    }),
  )
  .handler(async ({ data, context }): Promise<PmSettings> => {
    await requirePmMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "property.settings.manage");
    const raw = await callRpc<unknown>(
      context.supabase,
      "upsert_pm_settings",
      {
        _company_id: data.companyId,
        _enabled: data.enabled,
        _default_rental_mode: data.defaultRentalMode,
        _default_business_model: data.defaultBusinessModel,
        _property_number_prefix: data.propertyNumberPrefix,
        _require_ownership_hundred_pct: data.requireOwnershipHundredPct,
        _expected_version: data.expectedVersion,
      },
      PM_MIGRATION,
    );
    return mapPmSettings(raw);
  });

export const getPmDashboardKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<PmDashboardKpis> => {
    await requirePmMember(context.supabase, data.companyId);
    try {
      const raw = await callRpc<unknown>(
        context.supabase,
        "get_pm_dashboard_kpis",
        { _company_id: data.companyId },
        PM_MIGRATION,
      );
      return mapPmDashboardKpis(raw);
    } catch (error) {
      if (error instanceof Error && error.message === PM_MIGRATION) return emptyPmDashboardKpis();
      throw error;
    }
  });

export const listPmProperties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; search?: string | null; status?: string | null }) => ({
    companyId: companyIdOf(input),
    search: input.search?.trim() || null,
    status: input.status?.trim() || null,
  }))
  .handler(async ({ data, context }): Promise<PmProperty[]> => {
    await requirePmMember(context.supabase, data.companyId);
    const raw = await callRpc<unknown>(
      context.supabase,
      "list_pm_properties",
      {
        _company_id: data.companyId,
        _search: data.search,
        _status: data.status,
      },
      PM_MIGRATION,
    );
    const rows = Array.isArray(raw) ? raw : [];
    return rows.map(mapPmProperty);
  });

export const upsertPmProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; draft: PmPropertyDraft }) => ({
    companyId: companyIdOf(input),
    draft: input.draft,
  }))
  .handler(async ({ data, context }): Promise<PmProperty> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "property.manage");
    const d = data.draft;
    const raw = await callRpc<unknown>(
      context.supabase,
      "upsert_pm_property",
      {
        _company_id: data.companyId,
        _id: d.id ?? null,
        _code: d.code ?? null,
        _name: d.name,
        _rental_mode: d.rentalMode,
        _status: d.status ?? "draft",
        _currency_code: d.currencyCode,
        _country_code: d.countryCode ?? null,
        _region: d.region ?? null,
        _city: d.city ?? null,
        _address_line1: d.addressLine1 ?? null,
        _address_line2: d.addressLine2 ?? null,
        _postal_code: d.postalCode ?? null,
        _timezone: d.timezone ?? null,
        _bedrooms: d.bedrooms ?? null,
        _bathrooms: d.bathrooms ?? null,
        _capacity: d.capacity ?? null,
        _furnished: d.furnished ?? null,
        _acquisition_date: d.acquisitionDate ?? null,
        _commencement_date: d.commencementDate ?? null,
        _inactive_date: d.inactiveDate ?? null,
        _notes: d.notes ?? null,
        _manager_contact_id: d.managerContactId ?? null,
      },
      PM_MIGRATION,
    );
    return mapPmProperty(raw);
  });

export const listPmUnits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; propertyId?: string | null }) => ({
    companyId: companyIdOf(input),
    propertyId: input.propertyId ?? null,
  }))
  .handler(async ({ data, context }): Promise<PmUnit[]> => {
    await requirePmMember(context.supabase, data.companyId);
    const raw = await callRpc<unknown>(
      context.supabase,
      "list_pm_units",
      { _company_id: data.companyId, _property_id: data.propertyId },
      PM_MIGRATION,
    );
    const rows = Array.isArray(raw) ? raw : [];
    return rows.map(mapPmUnit);
  });

export const upsertPmUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; draft: PmUnitDraft }) => ({
    companyId: companyIdOf(input),
    draft: input.draft,
  }))
  .handler(async ({ data, context }): Promise<PmUnit> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "property.manage");
    const d = data.draft;
    const raw = await callRpc<unknown>(
      context.supabase,
      "upsert_pm_unit",
      {
        _company_id: data.companyId,
        _id: d.id ?? null,
        _property_id: d.propertyId,
        _code: d.code,
        _name: d.name,
        _status: d.status ?? "draft",
        _floor_label: d.floorLabel ?? null,
        _bedrooms: d.bedrooms ?? null,
        _bathrooms: d.bathrooms ?? null,
        _capacity: d.capacity ?? null,
        _furnished: d.furnished ?? null,
        _notes: d.notes ?? null,
      },
      PM_MIGRATION,
    );
    return mapPmUnit(raw);
  });

export const listPmOwners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; search?: string | null }) => ({
    companyId: companyIdOf(input),
    search: input.search?.trim() || null,
  }))
  .handler(async ({ data, context }): Promise<PmOwner[]> => {
    await requirePmMember(context.supabase, data.companyId);
    const raw = await callRpc<unknown>(
      context.supabase,
      "list_pm_owners",
      { _company_id: data.companyId, _search: data.search },
      PM_MIGRATION,
    );
    const rows = Array.isArray(raw) ? raw : [];
    return rows.map(mapPmOwner);
  });

export const upsertPmOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; draft: PmOwnerDraft }) => ({
    companyId: companyIdOf(input),
    draft: input.draft,
  }))
  .handler(async ({ data, context }): Promise<PmOwner> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "property.owner.manage");
    const d = data.draft;
    const raw = await callRpc<unknown>(
      context.supabase,
      "upsert_pm_owner",
      {
        _company_id: data.companyId,
        _id: d.id ?? null,
        _contact_id: d.contactId,
        _display_name: d.displayName ?? null,
        _status: d.status ?? "active",
        _statement_delivery_email: d.statementDeliveryEmail ?? null,
        _notes: d.notes ?? null,
      },
      PM_MIGRATION,
    );
    return mapPmOwner(raw);
  });

export const listPmOwnership = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; propertyId: string }) => ({
    companyId: companyIdOf(input),
    propertyId: String(input.propertyId),
  }))
  .handler(async ({ data, context }): Promise<PmOwnership[]> => {
    await requirePmMember(context.supabase, data.companyId);
    const raw = await callRpc<unknown>(
      context.supabase,
      "list_pm_property_ownership",
      { _company_id: data.companyId, _property_id: data.propertyId },
      PM_MIGRATION,
    );
    const rows = Array.isArray(raw) ? raw : [];
    return rows.map(mapPmOwnership);
  });

export const upsertPmOwnership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; draft: PmOwnershipDraft }) => ({
    companyId: companyIdOf(input),
    draft: input.draft,
  }))
  .handler(async ({ data, context }): Promise<PmOwnership> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "property.owner.manage");
    const d = data.draft;
    const raw = await callRpc<unknown>(
      context.supabase,
      "upsert_pm_property_ownership",
      {
        _company_id: data.companyId,
        _id: d.id ?? null,
        _property_id: d.propertyId,
        _owner_id: d.ownerId,
        _ownership_pct: d.ownershipPct,
        _distribution_pct: d.distributionPct ?? d.ownershipPct,
        _effective_from: d.effectiveFrom,
        _effective_to: d.effectiveTo ?? null,
      },
      PM_MIGRATION,
    );
    return mapPmOwnership(raw);
  });

export const listPmManagementAgreements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; propertyId?: string | null }) => ({
    companyId: companyIdOf(input),
    propertyId: input.propertyId ?? null,
  }))
  .handler(async ({ data, context }): Promise<PmManagementAgreement[]> => {
    await requirePmMember(context.supabase, data.companyId);
    const raw = await callRpc<unknown>(
      context.supabase,
      "list_pm_management_agreements",
      { _company_id: data.companyId, _property_id: data.propertyId },
      PM_MIGRATION,
    );
    const rows = Array.isArray(raw) ? raw : [];
    return rows.map(mapPmManagementAgreement);
  });

export const upsertPmManagementAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; draft: PmManagementAgreementDraft }) => ({
    companyId: companyIdOf(input),
    draft: input.draft,
  }))
  .handler(async ({ data, context }): Promise<PmManagementAgreement> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "property.manage");
    const d = data.draft;
    const raw = await callRpc<unknown>(
      context.supabase,
      "upsert_pm_management_agreement",
      {
        _company_id: data.companyId,
        _id: d.id ?? null,
        _property_id: d.propertyId,
        _owner_id: d.ownerId ?? null,
        _business_model: d.businessModel,
        _fee_type: d.feeType,
        _fee_rate_pct: d.feeRatePct ?? null,
        _fee_fixed_minor: d.feeFixedMinor ?? null,
        _minimum_monthly_fee_minor: d.minimumMonthlyFeeMinor ?? null,
        _minimum_reserve_minor: d.minimumReserveMinor ?? null,
        _payout_frequency: d.payoutFrequency ?? "monthly",
        _start_date: d.startDate,
        _end_date: d.endDate ?? null,
        _notes: d.notes ?? null,
        _activate: d.activate ?? false,
      },
      PM_MIGRATION,
    );
    return mapPmManagementAgreement(raw);
  });
