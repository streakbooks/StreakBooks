export type AdvisorsBillingStatus =
  | "pending_checkout"
  | "checkout_open"
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "cancelled"
  | "expired"
  | "manual_active";

export type AdvisorsBillingSku = {
  advisorsPlanCode: string;
  serviceCode: string;
  billingPlanCode: string;
  defaultInterval: "month" | "year";
  isRecurring: boolean;
  notes: string;
  planName: string;
  monthlyUsd: number;
};

export type AdvisorsSubscription = {
  id: string;
  engagementId: string;
  clientId: string;
  companyId: string;
  advisorsPlanCode: string | null;
  billingPlanCode: string;
  billingInterval: "month" | "year";
  currency: string;
  amountMinor: number;
  status: AdvisorsBillingStatus;
  checkoutId: string | null;
  startedAt: string | null;
  cancelledAt: string | null;
  adminNotes: string;
  createdAt: string;
  updatedAt: string;
  engagementTitle?: string | undefined;
  clientEmail?: string | undefined;
  clientName?: string | undefined;
  companyName?: string | undefined;
  companySubscriptionStatus?: string | null | undefined;
  companyPlanCode?: string | null | undefined;
};

export type AdvisorsEligibleEngagement = {
  id: string;
  title: string;
  status: string;
  serviceCode: string;
  planCode: string | null;
  amountMinor: number;
  currency: string;
  billingInterval: string | null;
  clientId: string;
  clientEmail: string | null;
  clientName: string | null;
  companyId: string | null;
  hasSubscription: boolean;
};

export type AdvisorsBillingBoard = {
  skuMap: AdvisorsBillingSku[];
  subscriptions: AdvisorsSubscription[];
  eligibleEngagements: AdvisorsEligibleEngagement[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asBool(value: unknown): boolean {
  return Boolean(value);
}

export function mapBillingSku(raw: unknown): AdvisorsBillingSku {
  const row = asRecord(raw);
  return {
    advisorsPlanCode: asString(row["advisorsPlanCode"]),
    serviceCode: asString(row["serviceCode"]),
    billingPlanCode: asString(row["billingPlanCode"]),
    defaultInterval: asString(row["defaultInterval"], "month") as "month" | "year",
    isRecurring: asBool(row["isRecurring"]),
    notes: asString(row["notes"]),
    planName: asString(row["planName"]),
    monthlyUsd: asNumber(row["monthlyUsd"]),
  };
}

export function mapAdvisorsSubscription(raw: unknown): AdvisorsSubscription {
  const row = asRecord(raw);
  return {
    id: asString(row["id"]),
    engagementId: asString(row["engagementId"]),
    clientId: asString(row["clientId"]),
    companyId: asString(row["companyId"]),
    advisorsPlanCode: asNullableString(row["advisorsPlanCode"]),
    billingPlanCode: asString(row["billingPlanCode"]),
    billingInterval: asString(row["billingInterval"], "month") as "month" | "year",
    currency: asString(row["currency"], "USD"),
    amountMinor: asNumber(row["amountMinor"]),
    status: asString(row["status"], "pending_checkout") as AdvisorsBillingStatus,
    checkoutId: asNullableString(row["checkoutId"]),
    startedAt: asNullableString(row["startedAt"]),
    cancelledAt: asNullableString(row["cancelledAt"]),
    adminNotes: asString(row["adminNotes"]),
    createdAt: asString(row["createdAt"]),
    updatedAt: asString(row["updatedAt"]),
    engagementTitle: asNullableString(row["engagementTitle"]) ?? undefined,
    clientEmail: asNullableString(row["clientEmail"]) ?? undefined,
    clientName: asNullableString(row["clientName"]) ?? undefined,
    companyName: asNullableString(row["companyName"]) ?? undefined,
    companySubscriptionStatus: asNullableString(row["companySubscriptionStatus"]),
    companyPlanCode: asNullableString(row["companyPlanCode"]),
  };
}

export function mapEligibleEngagement(raw: unknown): AdvisorsEligibleEngagement {
  const row = asRecord(raw);
  return {
    id: asString(row["id"]),
    title: asString(row["title"]),
    status: asString(row["status"]),
    serviceCode: asString(row["serviceCode"]),
    planCode: asNullableString(row["planCode"]),
    amountMinor: asNumber(row["amountMinor"]),
    currency: asString(row["currency"], "USD"),
    billingInterval: asNullableString(row["billingInterval"]),
    clientId: asString(row["clientId"]),
    clientEmail: asNullableString(row["clientEmail"]),
    clientName: asNullableString(row["clientName"]),
    companyId: asNullableString(row["companyId"]),
    hasSubscription: asBool(row["hasSubscription"]),
  };
}

export function mapBillingBoard(raw: unknown): AdvisorsBillingBoard {
  const row = asRecord(raw);
  return {
    skuMap: Array.isArray(row["skuMap"]) ? row["skuMap"].map(mapBillingSku) : [],
    subscriptions: Array.isArray(row["subscriptions"])
      ? row["subscriptions"].map(mapAdvisorsSubscription)
      : [],
    eligibleEngagements: Array.isArray(row["eligibleEngagements"])
      ? row["eligibleEngagements"].map(mapEligibleEngagement)
      : [],
  };
}
