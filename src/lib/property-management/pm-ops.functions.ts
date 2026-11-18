import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { companyIdOf, callRpc } from "@/lib/planning/rpc";
import type {
  PmLease,
  PmLeaseDraft,
  PmOwnerStatement,
  PmOwnerStatementLine,
  PmRentCharge,
  PmReservation,
  PmReservationDraft,
  PmTenant,
  PmTenantDraft,
} from "@/lib/property-management/ops-types";

export const PM_OPS_MIGRATION =
  "Property Management operations need database update 20261118160000 (tenants, leases, statements).";

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

function mapTenant(raw: unknown): PmTenant {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    id: str(pick(row, "id")),
    companyId: str(pick(row, "companyId", "company_id")),
    contactId: str(pick(row, "contactId", "contact_id")),
    contactName: strOrNull(pick(row, "contactName", "contact_name")),
    displayName: str(pick(row, "displayName", "display_name")),
    status: (pick(row, "status") ?? "active") as PmTenant["status"],
    emergencyContactName: strOrNull(
      pick(row, "emergencyContactName", "emergency_contact_name"),
    ),
    emergencyContactPhone: strOrNull(
      pick(row, "emergencyContactPhone", "emergency_contact_phone"),
    ),
    notes: strOrNull(pick(row, "notes")),
    createdAt: str(pick(row, "createdAt", "created_at")),
    updatedAt: str(pick(row, "updatedAt", "updated_at")),
  };
}

function mapLease(raw: unknown): PmLease {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    id: str(pick(row, "id")),
    companyId: str(pick(row, "companyId", "company_id")),
    propertyId: str(pick(row, "propertyId", "property_id")),
    unitId: strOrNull(pick(row, "unitId", "unit_id")),
    tenantId: str(pick(row, "tenantId", "tenant_id")),
    leaseNumber: str(pick(row, "leaseNumber", "lease_number")),
    status: (pick(row, "status") ?? "draft") as PmLease["status"],
    startDate: str(pick(row, "startDate", "start_date")),
    endDate: strOrNull(pick(row, "endDate", "end_date")),
    rentAmountMinor: num(pick(row, "rentAmountMinor", "rent_amount_minor")),
    currencyCode: str(pick(row, "currencyCode", "currency_code") ?? "USD"),
    rentFrequency: (pick(row, "rentFrequency", "rent_frequency") ??
      "monthly") as PmLease["rentFrequency"],
    dueDay: num(pick(row, "dueDay", "due_day"), 1),
    graceDays: num(pick(row, "graceDays", "grace_days"), 0),
    lateFeeMinor: num(pick(row, "lateFeeMinor", "late_fee_minor")),
    securityDepositMinor: num(pick(row, "securityDepositMinor", "security_deposit_minor")),
    notes: strOrNull(pick(row, "notes")),
    createdAt: str(pick(row, "createdAt", "created_at")),
    updatedAt: str(pick(row, "updatedAt", "updated_at")),
  };
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

function mapReservation(raw: unknown): PmReservation {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    id: str(pick(row, "id")),
    companyId: str(pick(row, "companyId", "company_id")),
    propertyId: str(pick(row, "propertyId", "property_id")),
    unitId: strOrNull(pick(row, "unitId", "unit_id")),
    guestContactId: strOrNull(pick(row, "guestContactId", "guest_contact_id")),
    guestName: str(pick(row, "guestName", "guest_name")),
    source: str(pick(row, "source")),
    externalReservationId: strOrNull(
      pick(row, "externalReservationId", "external_reservation_id"),
    ),
    status: str(pick(row, "status")),
    checkIn: str(pick(row, "checkIn", "check_in")),
    checkOut: str(pick(row, "checkOut", "check_out")),
    nights: num(pick(row, "nights")),
    currencyCode: str(pick(row, "currencyCode", "currency_code")),
    baseAmountMinor: num(pick(row, "baseAmountMinor", "base_amount_minor")),
    cleaningFeeMinor: num(pick(row, "cleaningFeeMinor", "cleaning_fee_minor")),
    channelFeeMinor: num(pick(row, "channelFeeMinor", "channel_fee_minor")),
    hostPayoutMinor: num(pick(row, "hostPayoutMinor", "host_payout_minor")),
    settlementStatus: str(pick(row, "settlementStatus", "settlement_status")),
    createdAt: str(pick(row, "createdAt", "created_at")),
  };
}

function mapStatement(raw: unknown): PmOwnerStatement {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    id: str(pick(row, "id")),
    companyId: str(pick(row, "companyId", "company_id")),
    statementNumber: str(pick(row, "statementNumber", "statement_number")),
    ownerId: str(pick(row, "ownerId", "owner_id")),
    propertyId: strOrNull(pick(row, "propertyId", "property_id")),
    periodStart: str(pick(row, "periodStart", "period_start")),
    periodEnd: str(pick(row, "periodEnd", "period_end")),
    basis: (pick(row, "basis") ?? "accrual") as PmOwnerStatement["basis"],
    currencyCode: str(pick(row, "currencyCode", "currency_code")),
    status: str(pick(row, "status")),
    openingBalanceMinor: num(pick(row, "openingBalanceMinor", "opening_balance_minor")),
    incomeMinor: num(pick(row, "incomeMinor", "income_minor")),
    expensesMinor: num(pick(row, "expensesMinor", "expenses_minor")),
    feesMinor: num(pick(row, "feesMinor", "fees_minor")),
    contributionsMinor: num(pick(row, "contributionsMinor", "contributions_minor")),
    distributionsMinor: num(pick(row, "distributionsMinor", "distributions_minor")),
    closingBalanceMinor: num(pick(row, "closingBalanceMinor", "closing_balance_minor")),
    reserveRequiredMinor: num(pick(row, "reserveRequiredMinor", "reserve_required_minor")),
    availableForDistributionMinor: num(
      pick(row, "availableForDistributionMinor", "available_for_distribution_minor"),
    ),
    calculatedAt: strOrNull(pick(row, "calculatedAt", "calculated_at")),
    approvedAt: strOrNull(pick(row, "approvedAt", "approved_at")),
    publishedAt: strOrNull(pick(row, "publishedAt", "published_at")),
    notes: strOrNull(pick(row, "notes")),
    createdAt: str(pick(row, "createdAt", "created_at")),
    updatedAt: str(pick(row, "updatedAt", "updated_at")),
  };
}

function mapStatementLine(raw: unknown): PmOwnerStatementLine {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    id: str(pick(row, "id")),
    companyId: str(pick(row, "companyId", "company_id")),
    statementId: str(pick(row, "statementId", "statement_id")),
    section: str(pick(row, "section")),
    lineDate: strOrNull(pick(row, "lineDate", "line_date")),
    description: str(pick(row, "description")),
    amountMinor: num(pick(row, "amountMinor", "amount_minor")),
    propertyId: strOrNull(pick(row, "propertyId", "property_id")),
    sourceType: strOrNull(pick(row, "sourceType", "source_type")),
    sourceId: strOrNull(pick(row, "sourceId", "source_id")),
    sortOrder: num(pick(row, "sortOrder", "sort_order")),
  };
}

export const listPmTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; search?: string | null }) => ({
    companyId: companyIdOf(input),
    search: input.search?.trim() || null,
  }))
  .handler(async ({ data, context }): Promise<PmTenant[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "property.view");
    const raw = await callRpc<unknown>(
      context.supabase,
      "list_pm_tenants",
      { _company_id: data.companyId, _search: data.search },
      PM_OPS_MIGRATION,
    );
    return (Array.isArray(raw) ? raw : []).map(mapTenant);
  });

export const upsertPmTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; draft: PmTenantDraft }) => ({
    companyId: companyIdOf(input),
    draft: input.draft,
  }))
  .handler(async ({ data, context }): Promise<PmTenant> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "property.tenant.manage");
    const d = data.draft;
    const raw = await callRpc<unknown>(
      context.supabase,
      "upsert_pm_tenant",
      {
        _company_id: data.companyId,
        _id: d.id ?? null,
        _contact_id: d.contactId,
        _display_name: d.displayName ?? null,
        _status: d.status ?? "active",
        _emergency_contact_name: d.emergencyContactName ?? null,
        _emergency_contact_phone: d.emergencyContactPhone ?? null,
        _notes: d.notes ?? null,
      },
      PM_OPS_MIGRATION,
    );
    return mapTenant(raw);
  });

export const listPmLeases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; propertyId?: string | null }) => ({
    companyId: companyIdOf(input),
    propertyId: input.propertyId ?? null,
  }))
  .handler(async ({ data, context }): Promise<PmLease[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "property.view");
    const raw = await callRpc<unknown>(
      context.supabase,
      "list_pm_leases",
      { _company_id: data.companyId, _property_id: data.propertyId },
      PM_OPS_MIGRATION,
    );
    return (Array.isArray(raw) ? raw : []).map(mapLease);
  });

export const upsertPmLease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; draft: PmLeaseDraft }) => ({
    companyId: companyIdOf(input),
    draft: input.draft,
  }))
  .handler(async ({ data, context }): Promise<PmLease> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "property.lease.manage");
    const d = data.draft;
    const raw = await callRpc<unknown>(
      context.supabase,
      "upsert_pm_lease",
      {
        _company_id: data.companyId,
        _id: d.id ?? null,
        _property_id: d.propertyId,
        _unit_id: d.unitId ?? null,
        _tenant_id: d.tenantId,
        _status: d.status ?? "draft",
        _start_date: d.startDate,
        _end_date: d.endDate ?? null,
        _rent_amount_minor: d.rentAmountMinor,
        _currency_code: d.currencyCode,
        _rent_frequency: d.rentFrequency ?? "monthly",
        _due_day: d.dueDay ?? 1,
        _grace_days: d.graceDays ?? 0,
        _late_fee_minor: d.lateFeeMinor ?? 0,
        _security_deposit_minor: d.securityDepositMinor ?? 0,
        _notes: d.notes ?? null,
      },
      PM_OPS_MIGRATION,
    );
    return mapLease(raw);
  });

export const listPmRentCharges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; leaseId?: string | null }) => ({
    companyId: companyIdOf(input),
    leaseId: input.leaseId ?? null,
  }))
  .handler(async ({ data, context }): Promise<PmRentCharge[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "property.view");
    const raw = await callRpc<unknown>(
      context.supabase,
      "list_pm_rent_charges",
      { _company_id: data.companyId, _lease_id: data.leaseId },
      PM_OPS_MIGRATION,
    );
    return (Array.isArray(raw) ? raw : []).map(mapRentCharge);
  });

export const generatePmRentCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      leaseId: string;
      periodStart: string;
      periodEnd: string;
      dueDate: string;
    }) => ({
      companyId: companyIdOf(input),
      leaseId: String(input.leaseId),
      periodStart: String(input.periodStart),
      periodEnd: String(input.periodEnd),
      dueDate: String(input.dueDate),
    }),
  )
  .handler(async ({ data, context }): Promise<PmRentCharge> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "property.rent.manage");
    const raw = await callRpc<unknown>(
      context.supabase,
      "generate_pm_rent_charge",
      {
        _company_id: data.companyId,
        _lease_id: data.leaseId,
        _period_start: data.periodStart,
        _period_end: data.periodEnd,
        _due_date: data.dueDate,
      },
      PM_OPS_MIGRATION,
    );
    return mapRentCharge(raw);
  });

export const listPmReservations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; propertyId?: string | null }) => ({
    companyId: companyIdOf(input),
    propertyId: input.propertyId ?? null,
  }))
  .handler(async ({ data, context }): Promise<PmReservation[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "property.view");
    const raw = await callRpc<unknown>(
      context.supabase,
      "list_pm_reservations",
      { _company_id: data.companyId, _property_id: data.propertyId },
      PM_OPS_MIGRATION,
    );
    return (Array.isArray(raw) ? raw : []).map(mapReservation);
  });

export const upsertPmReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; draft: PmReservationDraft }) => ({
    companyId: companyIdOf(input),
    draft: input.draft,
  }))
  .handler(async ({ data, context }): Promise<PmReservation> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "property.reservation.manage");
    const d = data.draft;
    const raw = await callRpc<unknown>(
      context.supabase,
      "upsert_pm_reservation",
      {
        _company_id: data.companyId,
        _id: d.id ?? null,
        _property_id: d.propertyId,
        _unit_id: d.unitId ?? null,
        _guest_contact_id: d.guestContactId ?? null,
        _guest_name: d.guestName,
        _source: d.source,
        _external_reservation_id: d.externalReservationId ?? null,
        _status: d.status ?? "confirmed",
        _check_in: d.checkIn,
        _check_out: d.checkOut,
        _currency_code: d.currencyCode,
        _base_amount_minor: d.baseAmountMinor ?? 0,
        _cleaning_fee_minor: d.cleaningFeeMinor ?? 0,
        _channel_fee_minor: d.channelFeeMinor ?? 0,
        _host_payout_minor: d.hostPayoutMinor ?? 0,
        _notes: d.notes ?? null,
      },
      PM_OPS_MIGRATION,
    );
    return mapReservation(raw);
  });

export const listPmOwnerStatements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; ownerId?: string | null }) => ({
    companyId: companyIdOf(input),
    ownerId: input.ownerId ?? null,
  }))
  .handler(async ({ data, context }): Promise<PmOwnerStatement[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "property.statements.view");
    const raw = await callRpc<unknown>(
      context.supabase,
      "list_pm_owner_statements",
      { _company_id: data.companyId, _owner_id: data.ownerId },
      PM_OPS_MIGRATION,
    );
    return (Array.isArray(raw) ? raw : []).map(mapStatement);
  });

export const getPmOwnerStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; statementId: string }) => ({
    companyId: companyIdOf(input),
    statementId: String(input.statementId),
  }))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ statement: PmOwnerStatement; lines: PmOwnerStatementLine[] }> => {
      await assertCompanyMember(context.supabase, data.companyId);
      await assertCompanyPermission(context.supabase, data.companyId, "property.statements.view");
      const raw = await callRpc<unknown>(
        context.supabase,
        "get_pm_owner_statement",
        { _company_id: data.companyId, _statement_id: data.statementId },
        PM_OPS_MIGRATION,
      );
      const row = (raw ?? {}) as Record<string, unknown>;
      const statementRaw = pick(row, "statement") ?? raw;
      const linesRaw = pick(row, "lines");
      return {
        statement: mapStatement(statementRaw),
        lines: (Array.isArray(linesRaw) ? linesRaw : []).map(mapStatementLine),
      };
    },
  );

export const generatePmOwnerStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      ownerId: string;
      propertyId?: string | null;
      periodStart: string;
      periodEnd: string;
      basis?: "cash" | "accrual";
    }) => ({
      companyId: companyIdOf(input),
      ownerId: String(input.ownerId),
      propertyId: input.propertyId ?? null,
      periodStart: String(input.periodStart),
      periodEnd: String(input.periodEnd),
      basis: input.basis ?? "accrual",
    }),
  )
  .handler(async ({ data, context }): Promise<PmOwnerStatement> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "property.statements.generate");
    const raw = await callRpc<unknown>(
      context.supabase,
      "generate_pm_owner_statement",
      {
        _company_id: data.companyId,
        _owner_id: data.ownerId,
        _property_id: data.propertyId,
        _period_start: data.periodStart,
        _period_end: data.periodEnd,
        _basis: data.basis,
      },
      PM_OPS_MIGRATION,
    );
    const row = (raw ?? {}) as Record<string, unknown>;
    return mapStatement(pick(row, "statement") ?? raw);
  });

export const approvePmOwnerStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; statementId: string }) => ({
    companyId: companyIdOf(input),
    statementId: String(input.statementId),
  }))
  .handler(async ({ data, context }): Promise<PmOwnerStatement> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "property.statements.approve");
    const raw = await callRpc<unknown>(
      context.supabase,
      "approve_pm_owner_statement",
      { _company_id: data.companyId, _statement_id: data.statementId },
      PM_OPS_MIGRATION,
    );
    const row = (raw ?? {}) as Record<string, unknown>;
    return mapStatement(pick(row, "statement") ?? raw);
  });

export const publishPmOwnerStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; statementId: string }) => ({
    companyId: companyIdOf(input),
    statementId: String(input.statementId),
  }))
  .handler(async ({ data, context }): Promise<PmOwnerStatement> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "property.statements.publish");
    const raw = await callRpc<unknown>(
      context.supabase,
      "publish_pm_owner_statement",
      { _company_id: data.companyId, _statement_id: data.statementId },
      PM_OPS_MIGRATION,
    );
    return mapStatement(raw);
  });
