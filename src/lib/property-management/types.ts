export type PmRentalMode = "short_term" | "long_term" | "hybrid";
export type PmPropertyStatus = "draft" | "active" | "inactive" | "archived";
export type PmBusinessModel = "agency" | "principal" | "owner_direct";
export type PmFeeType =
  | "percent_gross"
  | "percent_net"
  | "percent_accommodation"
  | "percent_collected"
  | "fixed_monthly"
  | "fixed_per_booking"
  | "tiered"
  | "custom";

export type PmSettings = {
  companyId: string;
  enabled: boolean;
  defaultRentalMode: PmRentalMode;
  defaultBusinessModel: PmBusinessModel;
  propertyNumberPrefix: string;
  requireOwnershipHundredPct: boolean;
  version: number;
  updatedAt: string | null;
};

export type PmDashboardKpis = {
  propertyCount: number;
  unitCount: number;
  ownerCount: number;
  activeAgreementCount: number;
  enabled: boolean;
  currencyNote: string;
};

export type PmProperty = {
  id: string;
  companyId: string;
  code: string;
  name: string;
  rentalMode: PmRentalMode;
  status: PmPropertyStatus;
  currencyCode: string;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  timezone: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  capacity: number | null;
  furnished: boolean | null;
  acquisitionDate: string | null;
  commencementDate: string | null;
  inactiveDate: string | null;
  notes: string | null;
  managerContactId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PmPropertyDraft = {
  id?: string | null;
  code?: string | null;
  name: string;
  rentalMode: PmRentalMode;
  status?: PmPropertyStatus;
  currencyCode: string;
  countryCode?: string | null;
  region?: string | null;
  city?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  timezone?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  capacity?: number | null;
  furnished?: boolean | null;
  acquisitionDate?: string | null;
  commencementDate?: string | null;
  inactiveDate?: string | null;
  notes?: string | null;
  managerContactId?: string | null;
};

export type PmUnit = {
  id: string;
  companyId: string;
  propertyId: string;
  code: string;
  name: string;
  status: PmPropertyStatus;
  floorLabel: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  capacity: number | null;
  furnished: boolean | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PmUnitDraft = {
  id?: string | null;
  propertyId: string;
  code: string;
  name: string;
  status?: PmPropertyStatus;
  floorLabel?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  capacity?: number | null;
  furnished?: boolean | null;
  notes?: string | null;
};

export type PmOwner = {
  id: string;
  companyId: string;
  contactId: string;
  contactName: string | null;
  displayName: string;
  status: "active" | "inactive" | "archived";
  statementDeliveryEmail: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PmOwnerDraft = {
  id?: string | null;
  contactId: string;
  displayName?: string | null;
  status?: "active" | "inactive" | "archived";
  statementDeliveryEmail?: string | null;
  notes?: string | null;
};

export type PmOwnership = {
  id: string;
  companyId: string;
  propertyId: string;
  ownerId: string;
  ownerDisplayName: string | null;
  ownershipPct: number;
  distributionPct: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
};

export type PmOwnershipDraft = {
  id?: string | null;
  propertyId: string;
  ownerId: string;
  ownershipPct: number;
  distributionPct?: number | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
};

export type PmManagementAgreement = {
  id: string;
  companyId: string;
  propertyId: string;
  ownerId: string | null;
  versionNo: number;
  status: "draft" | "active" | "superseded" | "terminated";
  businessModel: PmBusinessModel;
  feeType: PmFeeType;
  feeRatePct: number | null;
  feeFixedMinor: number | null;
  minimumMonthlyFeeMinor: number | null;
  minimumReserveMinor: number | null;
  payoutFrequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "manual";
  startDate: string;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PmManagementAgreementDraft = {
  id?: string | null;
  propertyId: string;
  ownerId?: string | null;
  businessModel: PmBusinessModel;
  feeType: PmFeeType;
  feeRatePct?: number | null;
  feeFixedMinor?: number | null;
  minimumMonthlyFeeMinor?: number | null;
  minimumReserveMinor?: number | null;
  payoutFrequency?: "weekly" | "biweekly" | "monthly" | "quarterly" | "manual";
  startDate: string;
  endDate?: string | null;
  notes?: string | null;
  activate?: boolean;
};

export function emptyPmDashboardKpis(): PmDashboardKpis {
  return {
    propertyCount: 0,
    unitCount: 0,
    ownerCount: 0,
    activeAgreementCount: 0,
    enabled: false,
    currencyNote: "KPIs are counts only until financial posting batches land.",
  };
}
