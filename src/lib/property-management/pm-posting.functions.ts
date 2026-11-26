import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { companyIdOf, callRpc } from "@/lib/planning/rpc";
import { mapPmSettings } from "@/lib/property-management/mappers";
import type { PmAccountMappings, PmSettings } from "@/lib/property-management/types";
import type { PmRentCharge } from "@/lib/property-management/ops-types";

export const PM_POSTING_MIGRATION =
  "Property Management posting needs database update 20261118170000 (COA mappings, payouts, portals).";

function pick(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function strOrNull(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v);
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function mapRentCharge(raw: unknown): PmRentCharge {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    id: str(pick(row, "id")),
    companyId: str(pick(row, "companyId", "company_id")),
    leaseId: str(pick(row, "leaseId", "lease_id")),
    propertyId: str(pick(row, "propertyId", "property_id")),
    unitId: strOrNull(pick(row, "unitId", "unit_id")),
    tenantId: str(pick(row, "tenantId", "tenant_id")),
    chargeNumber: str(pick(row, "chargeNumber", "charge_number")),
    periodStart: str(pick(row, "periodStart", "period_start")),
    periodEnd: str(pick(row, "periodEnd", "period_end")),
    dueDate: str(pick(row, "dueDate", "due_date")),
    amountMinor: num(pick(row, "amountMinor", "amount_minor")),
    currencyCode: str(pick(row, "currencyCode", "currency_code")),
    status: (pick(row, "status") ?? "draft") as PmRentCharge["status"],
    description: strOrNull(pick(row, "description")),
    journalId: strOrNull(pick(row, "journalId", "journal_id")),
    createdAt: str(pick(row, "createdAt", "created_at")),
  };
}

export type PmOwnerDistribution = {
  id: string;
  companyId: string;
  ownerId: string;
  propertyId: string | null;
  statementId: string | null;
  distributionNumber: string;
  status: string;
  amountMinor: number;
  currencyCode: string;
  payoutDate: string | null;
  memo: string | null;
  journalId: string | null;
  createdAt: string;
};

export type PmPortalAccess = {
  id: string;
  companyId: string;
  contactId: string;
  portalRole: "owner" | "tenant";
  ownerId: string | null;
  tenantId: string | null;
  status: string;
  invitedEmail: string | null;
  createdAt: string;
};

export type PmTrustSummary = {
  trustBankMapped: boolean;
  operatingBankMapped: boolean;
  coaReady: boolean;
  openDistributionDraftCount: number;
  postedDistributionTotalMinor: number;
  activePortalCount: number;
  reserveTotalMinor: number;
};

function mapDistribution(raw: unknown): PmOwnerDistribution {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    id: str(pick(row, "id")),
    companyId: str(pick(row, "companyId", "company_id")),
    ownerId: str(pick(row, "ownerId", "owner_id")),
    propertyId: strOrNull(pick(row, "propertyId", "property_id")),
    statementId: strOrNull(pick(row, "statementId", "statement_id")),
    distributionNumber: str(pick(row, "distributionNumber", "distribution_number")),
    status: str(pick(row, "status")),
    amountMinor: num(pick(row, "amountMinor", "amount_minor")),
    currencyCode: str(pick(row, "currencyCode", "currency_code")),
    payoutDate: strOrNull(pick(row, "payoutDate", "payout_date")),
    memo: strOrNull(pick(row, "memo")),
    journalId: strOrNull(pick(row, "journalId", "journal_id")),
    createdAt: str(pick(row, "createdAt", "created_at")),
  };
}

function mapPortal(raw: unknown): PmPortalAccess {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    id: str(pick(row, "id")),
    companyId: str(pick(row, "companyId", "company_id")),
    contactId: str(pick(row, "contactId", "contact_id")),
    portalRole: (pick(row, "portalRole", "portal_role") ?? "owner") as PmPortalAccess["portalRole"],
    ownerId: strOrNull(pick(row, "ownerId", "owner_id")),
    tenantId: strOrNull(pick(row, "tenantId", "tenant_id")),
    status: str(pick(row, "status")),
    invitedEmail: strOrNull(pick(row, "invitedEmail", "invited_email")),
    createdAt: str(pick(row, "createdAt", "created_at")),
  };
}

function mapTrust(raw: unknown): PmTrustSummary {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    trustBankMapped: Boolean(pick(row, "trustBankMapped", "trust_bank_mapped")),
    operatingBankMapped: Boolean(pick(row, "operatingBankMapped", "operating_bank_mapped")),
    coaReady: Boolean(pick(row, "coaReady", "coa_ready")),
    openDistributionDraftCount: num(
      pick(row, "openDistributionDraftCount", "open_distribution_draft_count"),
    ),
    postedDistributionTotalMinor: num(
      pick(row, "postedDistributionTotalMinor", "posted_distribution_total_minor"),
    ),
    activePortalCount: num(pick(row, "activePortalCount", "active_portal_count")),
    reserveTotalMinor: num(pick(row, "reserveTotalMinor", "reserve_total_minor")),
  };
}

export const upsertPmAccountMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { companyId: string; mappings: PmAccountMappings; expectedVersion: number }) => ({
      companyId: companyIdOf(input),
      mappings: input.mappings,
      expectedVersion: Number(input.expectedVersion),
    }),
  )
  .handler(async ({ data, context }): Promise<PmSettings> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "property.settings.manage");
    const m = data.mappings;
    const raw = await callRpc<unknown>(
      context.supabase,
      "upsert_pm_account_mappings",
      {
        _company_id: data.companyId,
        _rent_income_account_id: m.rentIncomeAccountId,
        _rent_receivable_account_id: m.rentReceivableAccountId,
        _owner_payable_account_id: m.ownerPayableAccountId,
        _commission_income_account_id: m.commissionIncomeAccountId,
        _trust_bank_account_id: m.trustBankAccountId,
        _deposit_liability_account_id: m.depositLiabilityAccountId,
        _operating_bank_account_id: m.operatingBankAccountId,
        _expected_version: data.expectedVersion,
      },
      PM_POSTING_MIGRATION,
    );
    return mapPmSettings(raw);
  });

export const postPmRentCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; chargeId: string }) => ({
    companyId: companyIdOf(input),
    chargeId: String(input.chargeId),
  }))
  .handler(
    async ({ data, context }): Promise<{ charge: PmRentCharge; journalId: string | null }> => {
      await assertCompanyMember(context.supabase, data.companyId);
      await assertCompanyPermission(context.supabase, data.companyId, "property.rent.manage");
      const raw = await callRpc<unknown>(
        context.supabase,
        "post_pm_rent_charge",
        { _company_id: data.companyId, _charge_id: data.chargeId },
        PM_POSTING_MIGRATION,
      );
      const row = (raw ?? {}) as Record<string, unknown>;
      return {
        charge: mapRentCharge(pick(row, "charge") ?? raw),
        journalId: strOrNull(pick(row, "journalId", "journal_id")),
      };
    },
  );

export const postPmCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; calculationId: string }) => ({
    companyId: companyIdOf(input),
    calculationId: String(input.calculationId),
  }))
  .handler(async ({ data, context }): Promise<{ journalId: string | null; status: string }> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "property.commission.manage");
    const raw = await callRpc<unknown>(
      context.supabase,
      "post_pm_commission",
      { _company_id: data.companyId, _calc_id: data.calculationId },
      PM_POSTING_MIGRATION,
    );
    const row = (raw ?? {}) as Record<string, unknown>;
    return {
      journalId: strOrNull(pick(row, "journalId", "journal_id")),
      status: str(pick(row, "status") ?? "posted"),
    };
  });

export const listPmOwnerDistributions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; ownerId?: string | null }) => ({
    companyId: companyIdOf(input),
    ownerId: input.ownerId ?? null,
  }))
  .handler(async ({ data, context }): Promise<PmOwnerDistribution[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<unknown>(
      context.supabase,
      "list_pm_owner_distributions",
      { _company_id: data.companyId, _owner_id: data.ownerId },
      PM_POSTING_MIGRATION,
    );
    return (Array.isArray(raw) ? raw : []).map(mapDistribution);
  });

export const upsertPmOwnerDistribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      ownerId: string;
      propertyId?: string | null;
      statementId?: string | null;
      amountMinor: number;
      currencyCode: string;
      payoutDate?: string | null;
      memo?: string | null;
    }) => ({
      companyId: companyIdOf(input),
      ownerId: String(input.ownerId),
      propertyId: input.propertyId ?? null,
      statementId: input.statementId ?? null,
      amountMinor: Math.trunc(Number(input.amountMinor)),
      currencyCode: String(input.currencyCode),
      payoutDate: input.payoutDate ?? null,
      memo: input.memo ?? null,
    }),
  )
  .handler(async ({ data, context }): Promise<PmOwnerDistribution> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "property.payouts.prepare");
    const raw = await callRpc<unknown>(
      context.supabase,
      "upsert_pm_owner_distribution",
      {
        _company_id: data.companyId,
        _owner_id: data.ownerId,
        _property_id: data.propertyId,
        _statement_id: data.statementId,
        _amount_minor: data.amountMinor,
        _currency_code: data.currencyCode,
        _payout_date: data.payoutDate,
        _memo: data.memo,
      },
      PM_POSTING_MIGRATION,
    );
    return mapDistribution(raw);
  });

export const approvePmOwnerDistribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; distributionId: string }) => ({
    companyId: companyIdOf(input),
    distributionId: String(input.distributionId),
  }))
  .handler(async ({ data, context }): Promise<PmOwnerDistribution> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "property.payouts.approve");
    const raw = await callRpc<unknown>(
      context.supabase,
      "approve_pm_owner_distribution",
      { _company_id: data.companyId, _distribution_id: data.distributionId },
      PM_POSTING_MIGRATION,
    );
    return mapDistribution(raw);
  });

export const postPmOwnerDistribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; distributionId: string }) => ({
    companyId: companyIdOf(input),
    distributionId: String(input.distributionId),
  }))
  .handler(async ({ data, context }): Promise<PmOwnerDistribution> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "property.payouts.record");
    const raw = await callRpc<unknown>(
      context.supabase,
      "post_pm_owner_distribution",
      { _company_id: data.companyId, _distribution_id: data.distributionId },
      PM_POSTING_MIGRATION,
    );
    return mapDistribution(raw);
  });

export const listPmPortalAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; portalRole?: "owner" | "tenant" | null }) => ({
    companyId: companyIdOf(input),
    portalRole: input.portalRole ?? null,
  }))
  .handler(async ({ data, context }): Promise<PmPortalAccess[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<unknown>(
      context.supabase,
      "list_pm_portal_access",
      { _company_id: data.companyId, _portal_role: data.portalRole },
      PM_POSTING_MIGRATION,
    );
    return (Array.isArray(raw) ? raw : []).map(mapPortal);
  });

export const upsertPmPortalAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      contactId: string;
      portalRole: "owner" | "tenant";
      ownerId?: string | null;
      tenantId?: string | null;
      invitedEmail?: string | null;
    }) => ({
      companyId: companyIdOf(input),
      contactId: String(input.contactId),
      portalRole: input.portalRole,
      ownerId: input.ownerId ?? null,
      tenantId: input.tenantId ?? null,
      invitedEmail: input.invitedEmail ?? null,
    }),
  )
  .handler(async ({ data, context }): Promise<PmPortalAccess> => {
    await assertCompanyMember(context.supabase, data.companyId);
    // RPC enforces property.settings.manage or owner/tenant manage by portal role.
    const raw = await callRpc<unknown>(
      context.supabase,
      "upsert_pm_portal_access",
      {
        _company_id: data.companyId,
        _contact_id: data.contactId,
        _portal_role: data.portalRole,
        _owner_id: data.ownerId,
        _tenant_id: data.tenantId,
        _invited_email: data.invitedEmail,
      },
      PM_POSTING_MIGRATION,
    );
    return mapPortal(raw);
  });

export const revokePmPortalAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; accessId: string }) => ({
    companyId: companyIdOf(input),
    accessId: String(input.accessId),
  }))
  .handler(async ({ data, context }): Promise<PmPortalAccess> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<unknown>(
      context.supabase,
      "revoke_pm_portal_access",
      { _company_id: data.companyId, _id: data.accessId },
      PM_POSTING_MIGRATION,
    );
    return mapPortal(raw);
  });

export const getPmTrustSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<PmTrustSummary> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const raw = await callRpc<unknown>(
      context.supabase,
      "get_pm_trust_summary",
      { _company_id: data.companyId },
      PM_POSTING_MIGRATION,
    );
    return mapTrust(raw);
  });
