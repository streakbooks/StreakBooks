import type { ExpenseDistanceUnit } from "./types";

export type { ExpenseDistanceUnit };

export type ExpenseMileageRate = {
  id: string;
  name: string;
  vehicleClass: string | null;
  distanceUnit: ExpenseDistanceUnit;
  rateMinorPerUnit: number;
  currencyCode: string;
  accountId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
};

export type ExpenseMileageLineDraft = {
  expenseDate: string;
  distanceValue: number;
  distanceUnit: ExpenseDistanceUnit;
  rate: Pick<
    ExpenseMileageRate,
    "id" | "rateMinorPerUnit" | "accountId" | "distanceUnit" | "currencyCode" | "name"
  >;
  origin?: string;
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

/** Round distance × rate-per-unit into minor currency units. */
export function calculateMileageNetMinor(
  distanceValue: number,
  rateMinorPerUnit: number,
): number {
  if (!Number.isFinite(distanceValue) || distanceValue <= 0) {
    throw new Error("Distance must be greater than zero.");
  }
  if (!Number.isFinite(rateMinorPerUnit) || rateMinorPerUnit <= 0) {
    throw new Error("Mileage rate must be greater than zero.");
  }
  return Math.round(distanceValue * rateMinorPerUnit);
}

export function isMileageRateEffectiveOn(
  rate: Pick<ExpenseMileageRate, "effectiveFrom" | "effectiveTo" | "isActive">,
  claimDate: string,
): boolean {
  if (!rate.isActive) return false;
  if (claimDate < rate.effectiveFrom) return false;
  if (rate.effectiveTo && claimDate > rate.effectiveTo) return false;
  return true;
}

export function buildMileageClaimLine(input: ExpenseMileageLineDraft) {
  if (input.distanceUnit !== input.rate.distanceUnit) {
    throw new Error("Distance unit must match the selected mileage rate.");
  }
  const netMinor = calculateMileageNetMinor(
    input.distanceValue,
    input.rate.rateMinorPerUnit,
  );
  const taxMinor = input.taxMinor ?? 0;
  const grossMinor = netMinor + taxMinor;
  const origin = input.origin?.trim() ?? "";
  const destination = input.destination?.trim() ?? "";
  const route =
    origin && destination
      ? `${origin} → ${destination}`
      : origin || destination || input.rate.name;

  return {
    expenseDate: input.expenseDate,
    description: `Mileage: ${route}`,
    accountId: input.rate.accountId,
    quantity: input.distanceValue,
    unitPriceMinor: input.rate.rateMinorPerUnit,
    netMinor,
    taxMinor,
    grossMinor,
    currencyCode: input.rate.currencyCode,
    reimbursableMinor: grossMinor,
    nonReimbursableMinor: 0,
    isBillable: input.isBillable ?? false,
    isMileage: true as const,
    distanceValue: input.distanceValue,
    distanceUnit: input.distanceUnit,
    mileageRateId: input.rate.id,
    ...(origin ? { tripOrigin: origin } : {}),
    ...(destination ? { tripDestination: destination } : {}),
  };
}

export function mapExpenseMileageRate(row: unknown): ExpenseMileageRate {
  const r = asRecord(row);
  const unit = str(r["distance_unit"] ?? r["distanceUnit"], "km");
  return {
    id: str(r["id"]),
    name: str(r["name"]),
    vehicleClass: (r["vehicle_class"] ?? r["vehicleClass"] ?? null) as string | null,
    distanceUnit: unit === "mi" ? "mi" : "km",
    rateMinorPerUnit: num(r["rate_minor_per_unit"] ?? r["rateMinorPerUnit"]),
    currencyCode: str(r["currency_code"] ?? r["currencyCode"]).toUpperCase(),
    accountId: str(r["account_id"] ?? r["accountId"]),
    effectiveFrom: str(r["effective_from"] ?? r["effectiveFrom"]),
    effectiveTo: (r["effective_to"] ?? r["effectiveTo"] ?? null) as string | null,
    isActive: Boolean(r["is_active"] ?? r["isActive"] ?? true),
  };
}

export function toExpenseMileageRatePayload(input: {
  id?: string;
  name: string;
  vehicleClass?: string | null;
  distanceUnit: ExpenseDistanceUnit;
  rateMinorPerUnit: number;
  currencyCode: string;
  accountId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isActive?: boolean;
}): Record<string, unknown> {
  return {
    id: input.id ?? null,
    name: input.name,
    vehicle_class: input.vehicleClass ?? null,
    distance_unit: input.distanceUnit,
    rate_minor_per_unit: input.rateMinorPerUnit,
    currency_code: input.currencyCode.toUpperCase(),
    account_id: input.accountId,
    effective_from: input.effectiveFrom,
    effective_to: input.effectiveTo ?? null,
    is_active: input.isActive ?? true,
  };
}
