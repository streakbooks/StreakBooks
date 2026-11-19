import type {
  PmDashboardKpis,
  PmManagementAgreement,
  PmOwner,
  PmOwnership,
  PmProperty,
  PmSettings,
  PmUnit,
} from "@/lib/property-management/types";

function asRow(raw: unknown): Record<string, unknown> {
  return (raw ?? {}) as Record<string, unknown>;
}

function pick(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
}

function str(value: unknown): string {
  return value == null ? "" : String(value);
}

function strOrNull(value: unknown): string | null {
  if (value == null || value === "") return null;
  return String(value);
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function boolOrNull(value: unknown): boolean | null {
  if (value == null) return null;
  return Boolean(value);
}

export function mapPmSettings(raw: unknown): PmSettings {
  const row = asRow(raw);
  return {
    companyId: str(pick(row, "companyId", "company_id")),
    enabled: Boolean(pick(row, "enabled") ?? false),
    defaultRentalMode: (pick(row, "defaultRentalMode", "default_rental_mode") ??
      "hybrid") as PmSettings["defaultRentalMode"],
    defaultBusinessModel: (pick(row, "defaultBusinessModel", "default_business_model") ??
      "agency") as PmSettings["defaultBusinessModel"],
    propertyNumberPrefix: str(pick(row, "propertyNumberPrefix", "property_number_prefix") ?? "PROP-"),
    requireOwnershipHundredPct: Boolean(
      pick(row, "requireOwnershipHundredPct", "require_ownership_hundred_pct") ?? true,
    ),
    rentIncomeAccountId: strOrNull(pick(row, "rentIncomeAccountId", "rent_income_account_id")),
    rentReceivableAccountId: strOrNull(
      pick(row, "rentReceivableAccountId", "rent_receivable_account_id"),
    ),
    ownerPayableAccountId: strOrNull(pick(row, "ownerPayableAccountId", "owner_payable_account_id")),
    commissionIncomeAccountId: strOrNull(
      pick(row, "commissionIncomeAccountId", "commission_income_account_id"),
    ),
    trustBankAccountId: strOrNull(pick(row, "trustBankAccountId", "trust_bank_account_id")),
    depositLiabilityAccountId: strOrNull(
      pick(row, "depositLiabilityAccountId", "deposit_liability_account_id"),
    ),
    operatingBankAccountId: strOrNull(
      pick(row, "operatingBankAccountId", "operating_bank_account_id"),
    ),
    version: Number(pick(row, "version") ?? 1),
    updatedAt: strOrNull(pick(row, "updatedAt", "updated_at")),
  };
}

export function mapPmDashboardKpis(raw: unknown): PmDashboardKpis {
  const row = asRow(raw);
  return {
    propertyCount: Number(pick(row, "propertyCount", "property_count") ?? 0),
    unitCount: Number(pick(row, "unitCount", "unit_count") ?? 0),
    ownerCount: Number(pick(row, "ownerCount", "owner_count") ?? 0),
    activeAgreementCount: Number(
      pick(row, "activeAgreementCount", "active_agreement_count") ?? 0,
    ),
    enabled: Boolean(pick(row, "enabled") ?? false),
    currencyNote: str(
      pick(row, "currencyNote", "currency_note") ??
        "KPIs are counts only until financial posting batches land.",
    ),
  };
}

export function mapPmProperty(raw: unknown): PmProperty {
  const row = asRow(raw);
  return {
    id: str(pick(row, "id")),
    companyId: str(pick(row, "companyId", "company_id")),
    code: str(pick(row, "code")),
    name: str(pick(row, "name")),
    rentalMode: (pick(row, "rentalMode", "rental_mode") ?? "hybrid") as PmProperty["rentalMode"],
    status: (pick(row, "status") ?? "draft") as PmProperty["status"],
    currencyCode: str(pick(row, "currencyCode", "currency_code") ?? "USD"),
    countryCode: strOrNull(pick(row, "countryCode", "country_code")),
    region: strOrNull(pick(row, "region")),
    city: strOrNull(pick(row, "city")),
    addressLine1: strOrNull(pick(row, "addressLine1", "address_line1")),
    addressLine2: strOrNull(pick(row, "addressLine2", "address_line2")),
    postalCode: strOrNull(pick(row, "postalCode", "postal_code")),
    timezone: strOrNull(pick(row, "timezone")),
    bedrooms: numOrNull(pick(row, "bedrooms")),
    bathrooms: numOrNull(pick(row, "bathrooms")),
    capacity: numOrNull(pick(row, "capacity")),
    furnished: boolOrNull(pick(row, "furnished")),
    acquisitionDate: strOrNull(pick(row, "acquisitionDate", "acquisition_date")),
    commencementDate: strOrNull(pick(row, "commencementDate", "commencement_date")),
    inactiveDate: strOrNull(pick(row, "inactiveDate", "inactive_date")),
    notes: strOrNull(pick(row, "notes")),
    managerContactId: strOrNull(pick(row, "managerContactId", "manager_contact_id")),
    createdAt: str(pick(row, "createdAt", "created_at")),
    updatedAt: str(pick(row, "updatedAt", "updated_at")),
  };
}

export function mapPmUnit(raw: unknown): PmUnit {
  const row = asRow(raw);
  return {
    id: str(pick(row, "id")),
    companyId: str(pick(row, "companyId", "company_id")),
    propertyId: str(pick(row, "propertyId", "property_id")),
    code: str(pick(row, "code")),
    name: str(pick(row, "name")),
    status: (pick(row, "status") ?? "draft") as PmUnit["status"],
    floorLabel: strOrNull(pick(row, "floorLabel", "floor_label")),
    bedrooms: numOrNull(pick(row, "bedrooms")),
    bathrooms: numOrNull(pick(row, "bathrooms")),
    capacity: numOrNull(pick(row, "capacity")),
    furnished: boolOrNull(pick(row, "furnished")),
    notes: strOrNull(pick(row, "notes")),
    createdAt: str(pick(row, "createdAt", "created_at")),
    updatedAt: str(pick(row, "updatedAt", "updated_at")),
  };
}

export function mapPmOwner(raw: unknown): PmOwner {
  const row = asRow(raw);
  return {
    id: str(pick(row, "id")),
    companyId: str(pick(row, "companyId", "company_id")),
    contactId: str(pick(row, "contactId", "contact_id")),
    contactName: strOrNull(pick(row, "contactName", "contact_name")),
    displayName: str(pick(row, "displayName", "display_name")),
    status: (pick(row, "status") ?? "active") as PmOwner["status"],
    statementDeliveryEmail: strOrNull(
      pick(row, "statementDeliveryEmail", "statement_delivery_email"),
    ),
    notes: strOrNull(pick(row, "notes")),
    createdAt: str(pick(row, "createdAt", "created_at")),
    updatedAt: str(pick(row, "updatedAt", "updated_at")),
  };
}

export function mapPmOwnership(raw: unknown): PmOwnership {
  const row = asRow(raw);
  return {
    id: str(pick(row, "id")),
    companyId: str(pick(row, "companyId", "company_id")),
    propertyId: str(pick(row, "propertyId", "property_id")),
    ownerId: str(pick(row, "ownerId", "owner_id")),
    ownerDisplayName: strOrNull(pick(row, "ownerDisplayName", "owner_display_name")),
    ownershipPct: Number(pick(row, "ownershipPct", "ownership_pct") ?? 0),
    distributionPct: Number(pick(row, "distributionPct", "distribution_pct") ?? 0),
    effectiveFrom: str(pick(row, "effectiveFrom", "effective_from")),
    effectiveTo: strOrNull(pick(row, "effectiveTo", "effective_to")),
    createdAt: str(pick(row, "createdAt", "created_at")),
  };
}

export function mapPmManagementAgreement(raw: unknown): PmManagementAgreement {
  const row = asRow(raw);
  return {
    id: str(pick(row, "id")),
    companyId: str(pick(row, "companyId", "company_id")),
    propertyId: str(pick(row, "propertyId", "property_id")),
    ownerId: strOrNull(pick(row, "ownerId", "owner_id")),
    versionNo: Number(pick(row, "versionNo", "version_no") ?? 1),
    status: (pick(row, "status") ?? "draft") as PmManagementAgreement["status"],
    businessModel: (pick(row, "businessModel", "business_model") ??
      "agency") as PmManagementAgreement["businessModel"],
    feeType: (pick(row, "feeType", "fee_type") ??
      "percent_gross") as PmManagementAgreement["feeType"],
    feeRatePct: numOrNull(pick(row, "feeRatePct", "fee_rate_pct")),
    feeFixedMinor: numOrNull(pick(row, "feeFixedMinor", "fee_fixed_minor")),
    minimumMonthlyFeeMinor: numOrNull(
      pick(row, "minimumMonthlyFeeMinor", "minimum_monthly_fee_minor"),
    ),
    minimumReserveMinor: numOrNull(pick(row, "minimumReserveMinor", "minimum_reserve_minor")),
    payoutFrequency: (pick(row, "payoutFrequency", "payout_frequency") ??
      "monthly") as PmManagementAgreement["payoutFrequency"],
    startDate: str(pick(row, "startDate", "start_date")),
    endDate: strOrNull(pick(row, "endDate", "end_date")),
    notes: strOrNull(pick(row, "notes")),
    createdAt: str(pick(row, "createdAt", "created_at")),
    updatedAt: str(pick(row, "updatedAt", "updated_at")),
  };
}
