export type PmTenant = {
  id: string;
  companyId: string;
  contactId: string;
  contactName: string | null;
  displayName: string;
  status: "active" | "inactive" | "archived";
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PmTenantDraft = {
  id?: string | null;
  contactId: string;
  displayName?: string | null;
  status?: PmTenant["status"];
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  notes?: string | null;
};

export type PmLease = {
  id: string;
  companyId: string;
  propertyId: string;
  unitId: string | null;
  tenantId: string;
  leaseNumber: string;
  status: "draft" | "active" | "expired" | "terminated" | "archived";
  startDate: string;
  endDate: string | null;
  rentAmountMinor: number;
  currencyCode: string;
  rentFrequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "annual";
  dueDay: number;
  graceDays: number;
  lateFeeMinor: number;
  securityDepositMinor: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PmLeaseDraft = {
  id?: string | null;
  propertyId: string;
  unitId?: string | null;
  tenantId: string;
  status?: PmLease["status"];
  startDate: string;
  endDate?: string | null;
  rentAmountMinor: number;
  currencyCode: string;
  rentFrequency?: PmLease["rentFrequency"];
  dueDay?: number;
  graceDays?: number;
  lateFeeMinor?: number;
  securityDepositMinor?: number;
  notes?: string | null;
};

export type PmRentCharge = {
  id: string;
  companyId: string;
  leaseId: string;
  propertyId: string;
  unitId: string | null;
  tenantId: string;
  chargeNumber: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amountMinor: number;
  currencyCode: string;
  status: "draft" | "posted" | "partially_paid" | "paid" | "void";
  description: string | null;
  createdAt: string;
};

export type PmReservation = {
  id: string;
  companyId: string;
  propertyId: string;
  unitId: string | null;
  guestContactId: string | null;
  guestName: string;
  source: string;
  externalReservationId: string | null;
  status: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  currencyCode: string;
  baseAmountMinor: number;
  cleaningFeeMinor: number;
  channelFeeMinor: number;
  hostPayoutMinor: number;
  settlementStatus: string;
  createdAt: string;
};

export type PmReservationDraft = {
  id?: string | null;
  propertyId: string;
  unitId?: string | null;
  guestContactId?: string | null;
  guestName: string;
  source: string;
  externalReservationId?: string | null;
  status?: string;
  checkIn: string;
  checkOut: string;
  currencyCode: string;
  baseAmountMinor?: number;
  cleaningFeeMinor?: number;
  channelFeeMinor?: number;
  hostPayoutMinor?: number;
  notes?: string | null;
};

export type PmOwnerStatement = {
  id: string;
  companyId: string;
  statementNumber: string;
  ownerId: string;
  propertyId: string | null;
  periodStart: string;
  periodEnd: string;
  basis: "cash" | "accrual";
  currencyCode: string;
  status: string;
  openingBalanceMinor: number;
  incomeMinor: number;
  expensesMinor: number;
  feesMinor: number;
  contributionsMinor: number;
  distributionsMinor: number;
  closingBalanceMinor: number;
  reserveRequiredMinor: number;
  availableForDistributionMinor: number;
  calculatedAt: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PmOwnerStatementLine = {
  id: string;
  companyId: string;
  statementId: string;
  section: string;
  lineDate: string | null;
  description: string;
  amountMinor: number;
  propertyId: string | null;
  sourceType: string | null;
  sourceId: string | null;
  sortOrder: number;
};

/** Pure commission helper for unit tests and client preview — authoritative calc is SQL. */
export function computeCommissionMinor(input: {
  feeType: string;
  ratePct: number | null;
  fixedMinor: number | null;
  minimumMinor: number | null;
  baseAmountMinor: number;
}): number {
  const base = Math.max(0, Math.trunc(input.baseAmountMinor));
  let commission = 0;
  switch (input.feeType) {
    case "fixed_monthly":
    case "fixed_per_booking":
      commission = Math.max(0, Math.trunc(input.fixedMinor ?? 0));
      break;
    case "percent_gross":
    case "percent_net":
    case "percent_accommodation":
    case "percent_collected":
      commission = Math.round((base * Number(input.ratePct ?? 0)) / 100);
      break;
    default:
      commission = Math.round((base * Number(input.ratePct ?? 0)) / 100);
  }
  const minimum = Math.max(0, Math.trunc(input.minimumMinor ?? 0));
  return Math.max(commission, minimum);
}

export function statementTotalsBalance(statement: {
  openingBalanceMinor: number;
  incomeMinor: number;
  expensesMinor: number;
  feesMinor: number;
  contributionsMinor: number;
  distributionsMinor: number;
  closingBalanceMinor: number;
}): boolean {
  const expected =
    statement.openingBalanceMinor +
    statement.incomeMinor -
    statement.expensesMinor -
    statement.feesMinor +
    statement.contributionsMinor -
    statement.distributionsMinor;
  return expected === statement.closingBalanceMinor;
}
