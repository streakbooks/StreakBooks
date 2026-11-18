export type ExpensePerDiemRate = {
  id: string;
  name: string;
  locationLabel: string | null;
  rateMinorPerDay: number;
  currencyCode: string;
  accountId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
};

export type ExpensePerDiemLineDraft = {
  expenseDate: string;
  travelStartDate: string;
  travelEndDate: string;
  dayCount?: number;
  rate: Pick<
    ExpensePerDiemRate,
    "id" | "rateMinorPerDay" | "accountId" | "currencyCode" | "name" | "locationLabel"
  >;
  destination?: string;
  taxMinor?: number;
  isBillable?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

/** Inclusive calendar days between ISO date-only strings (YYYY-MM-DD). */
export function inclusiveTravelDays(startDate: string, endDate: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error("Travel dates must be YYYY-MM-DD.");
  }
  if (endDate < startDate) {
    throw new Error("Travel end date must be on or after the start date.");
  }
  const start = Date.UTC(
    Number(startDate.slice(0, 4)),
    Number(startDate.slice(5, 7)) - 1,
    Number(startDate.slice(8, 10)),
  );
  const end = Date.UTC(
    Number(endDate.slice(0, 4)),
    Number(endDate.slice(5, 7)) - 1,
    Number(endDate.slice(8, 10)),
  );
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function calculatePerDiemNetMinor(dayCount: number, rateMinorPerDay: number): number {
  if (!Number.isFinite(dayCount) || dayCount <= 0) {
    throw new Error("Travel day count must be greater than zero.");
  }
  if (!Number.isFinite(rateMinorPerDay) || rateMinorPerDay <= 0) {
    throw new Error("Per diem rate must be greater than zero.");
  }
  return Math.round(dayCount * rateMinorPerDay);
}

export function isPerDiemRateEffectiveOn(
  rate: Pick<ExpensePerDiemRate, "effectiveFrom" | "effectiveTo" | "isActive">,
  claimDate: string,
): boolean {
  if (!rate.isActive) return false;
  if (claimDate < rate.effectiveFrom) return false;
  if (rate.effectiveTo && claimDate > rate.effectiveTo) return false;
  return true;
}

export function buildPerDiemClaimLine(input: ExpensePerDiemLineDraft) {
  const dayCount =
    input.dayCount ?? inclusiveTravelDays(input.travelStartDate, input.travelEndDate);
  const netMinor = calculatePerDiemNetMinor(dayCount, input.rate.rateMinorPerDay);
  const taxMinor = input.taxMinor ?? 0;
  const grossMinor = netMinor + taxMinor;
  const destination =
    input.destination?.trim() || input.rate.locationLabel?.trim() || input.rate.name;

  return {
    expenseDate: input.expenseDate,
    description: `Per diem: ${destination} (${dayCount} day${dayCount === 1 ? "" : "s"})`,
    accountId: input.rate.accountId,
    quantity: dayCount,
    unitPriceMinor: input.rate.rateMinorPerDay,
    netMinor,
    taxMinor,
    grossMinor,
    currencyCode: input.rate.currencyCode,
    reimbursableMinor: grossMinor,
    nonReimbursableMinor: 0,
    isBillable: input.isBillable ?? false,
    isPerDiem: true as const,
    travelDayCount: dayCount,
    perDiemRateId: input.rate.id,
    travelStartDate: input.travelStartDate,
    travelEndDate: input.travelEndDate,
    tripDestination: destination,
  };
}

export function mapExpensePerDiemRate(row: unknown): ExpensePerDiemRate {
  const r = asRecord(row);
  return {
    id: str(r["id"]),
    name: str(r["name"]),
    locationLabel: (r["location_label"] ?? r["locationLabel"] ?? null) as string | null,
    rateMinorPerDay: num(r["rate_minor_per_day"] ?? r["rateMinorPerDay"]),
    currencyCode: str(r["currency_code"] ?? r["currencyCode"]).toUpperCase(),
    accountId: str(r["account_id"] ?? r["accountId"]),
    effectiveFrom: str(r["effective_from"] ?? r["effectiveFrom"]),
    effectiveTo: (r["effective_to"] ?? r["effectiveTo"] ?? null) as string | null,
    isActive: Boolean(r["is_active"] ?? r["isActive"] ?? true),
  };
}

export function toExpensePerDiemRatePayload(input: {
  id?: string;
  name: string;
  locationLabel?: string | null;
  rateMinorPerDay: number;
  currencyCode: string;
  accountId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isActive?: boolean;
}): Record<string, unknown> {
  return {
    id: input.id ?? null,
    name: input.name,
    location_label: input.locationLabel ?? null,
    rate_minor_per_day: input.rateMinorPerDay,
    currency_code: input.currencyCode.toUpperCase(),
    account_id: input.accountId,
    effective_from: input.effectiveFrom,
    effective_to: input.effectiveTo ?? null,
    is_active: input.isActive ?? true,
  };
}
