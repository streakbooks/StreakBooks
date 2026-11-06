import {
  DEFAULT_ADVISOR_SERVICES,
  type AdvisorBillingCadence,
  type AdvisorService,
  type AdvisorServiceBenefit,
  type AdvisorServicePlan,
} from "@/lib/advisors/catalogue";

export type AdvisorAdminPlan = AdvisorServicePlan & {
  isPublished: boolean;
  isEnabled: boolean;
  isArchived: boolean;
  sessionDurationMinutes: number | null;
  transactionLimit: number | null;
  accountLimit: number | null;
  sessionsIncluded: number | null;
  annualAmountMinor: number | null;
  features: string[];
};

export type AdvisorAdminService = Omit<AdvisorService, "plans"> & {
  isPublished: boolean;
  isEnabled: boolean;
  chatWelcome: string;
  exclusions: string[];
  plans: AdvisorAdminPlan[];
};

export type AdvisorCataloguePayload = {
  services: AdvisorAdminService[];
};

export type AdvisorCatalogueVersionSummary = {
  id: string;
  versionNumber: number;
  status: "draft" | "published" | "archived";
  label: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdvisorCatalogueAuditRow = {
  id: string;
  action: string;
  versionId: string | null;
  reason: string;
  createdAt: string;
  actorUserId: string | null;
};

export function defaultAdminCatalogue(): AdvisorCataloguePayload {
  return {
    services: DEFAULT_ADVISOR_SERVICES.map((service) => ({
      ...service,
      isPublished: true,
      isEnabled: true,
      chatWelcome:
        service.code === "bookkeeping"
          ? "Thanks for choosing bookkeeping support. I can help you pick a plan or book a free consultation."
          : "Thanks for choosing coaching. I can help you pick a session plan or book a free consultation.",
      exclusions: [
        "Historical bookkeeping cleanup",
        "Tax return preparation and filing",
        "Statutory representation",
        "Payroll processing",
        "Complex inventory valuation",
        "Audits and assurance",
        "Extraordinary transaction volumes",
        "Specialized compliance services",
      ],
      plans: service.plans.map((plan) => enrichPlan(plan)),
    })),
  };
}

export function enrichPlan(plan: AdvisorServicePlan): AdvisorAdminPlan {
  const bookkeepingLimits: Record<
    string,
    { tx: number; accounts: number; minutes: number | null }
  > = {
    essential_books: { tx: 100, accounts: 2, minutes: null },
    growth_books: { tx: 300, accounts: 5, minutes: 30 },
    complete_books: { tx: 600, accounts: 10, minutes: 60 },
  };
  const coachingSessions: Record<string, number> = {
    quick_guidance: 1,
    monthly_coaching: 2,
    business_coaching: 4,
  };
  const limits = bookkeepingLimits[plan.code];
  return {
    ...plan,
    isPublished: true,
    isEnabled: true,
    isArchived: false,
    sessionDurationMinutes: plan.serviceCode === "coaching" ? 45 : (limits?.minutes ?? null),
    transactionLimit: limits?.tx ?? null,
    accountLimit: limits?.accounts ?? null,
    sessionsIncluded:
      coachingSessions[plan.code] ??
      (plan.serviceCode === "bookkeeping" && limits?.minutes ? 1 : null),
    annualAmountMinor: plan.cadence === "month" ? plan.amountMinor * 10 : null,
    features: [],
  };
}

export function normalizeAdminPayload(input: unknown): AdvisorCataloguePayload {
  if (!input || typeof input !== "object") return defaultAdminCatalogue();
  const record = input as Record<string, unknown>;
  const servicesRaw = record["services"];
  if (!Array.isArray(servicesRaw) || servicesRaw.length === 0) return defaultAdminCatalogue();
  const services: AdvisorAdminService[] = [];
  for (const row of servicesRaw) {
    const service = normalizeAdminService(row);
    if (service) services.push(service);
  }
  return services.length > 0 ? { services } : defaultAdminCatalogue();
}

export function validateAdminPayload(payload: AdvisorCataloguePayload): string[] {
  const errors: string[] = [];
  if (payload.services.length < 1) errors.push("At least one service is required.");
  const codes = new Set<string>();
  for (const service of payload.services) {
    if (!service.code.trim()) errors.push("Every service needs a code.");
    if (codes.has(service.code)) errors.push(`Duplicate service code: ${service.code}`);
    codes.add(service.code);
    if (!service.name.trim()) errors.push(`Service ${service.code} needs a name.`);
    if (service.startingAmountMinor < 0) {
      errors.push(`Service ${service.code} starting price cannot be negative.`);
    }
    if (service.plans.length < 1) errors.push(`Service ${service.code} needs at least one plan.`);
    const planCodes = new Set<string>();
    for (const plan of service.plans) {
      if (!plan.code.trim()) errors.push(`A plan under ${service.code} is missing a code.`);
      if (planCodes.has(plan.code)) errors.push(`Duplicate plan code: ${plan.code}`);
      planCodes.add(plan.code);
      if (!plan.name.trim()) errors.push(`Plan ${plan.code} needs a name.`);
      if (plan.amountMinor < 0) errors.push(`Plan ${plan.code} price cannot be negative.`);
      if (plan.sessionDurationMinutes != null) {
        if (plan.sessionDurationMinutes < 15 || plan.sessionDurationMinutes > 240) {
          errors.push(`Plan ${plan.code} session duration must be 15–240 minutes.`);
        }
      }
    }
  }
  return errors;
}

export function upsertPlanInPayload(
  payload: AdvisorCataloguePayload,
  serviceCode: string,
  plan: AdvisorAdminPlan,
): AdvisorCataloguePayload {
  return {
    services: payload.services.map((service) => {
      if (service.code !== serviceCode) return service;
      const existing = service.plans.findIndex((row) => row.code === plan.code);
      const plans = [...service.plans];
      if (existing >= 0) plans[existing] = { ...plan, serviceCode };
      else plans.push({ ...plan, serviceCode });
      const starting = Math.min(
        ...plans.filter((row) => row.isEnabled && !row.isArchived).map((row) => row.amountMinor),
      );
      return {
        ...service,
        startingAmountMinor: Number.isFinite(starting) ? starting : service.startingAmountMinor,
        startingLabel: formatStartingLabel(
          Number.isFinite(starting) ? starting : service.startingAmountMinor,
          service.currency,
          service.cadence,
        ),
        plans: plans.sort((a, b) => a.sortOrder - b.sortOrder),
      };
    }),
  };
}

export function archivePlanInPayload(
  payload: AdvisorCataloguePayload,
  serviceCode: string,
  planCode: string,
): AdvisorCataloguePayload {
  return {
    services: payload.services.map((service) => {
      if (service.code !== serviceCode) return service;
      return {
        ...service,
        plans: service.plans.map((plan) =>
          plan.code === planCode
            ? { ...plan, isArchived: true, isEnabled: false, isPublished: false }
            : plan,
        ),
      };
    }),
  };
}

export function formatStartingLabel(
  amountMinor: number,
  currency: string,
  cadence: AdvisorBillingCadence,
): string {
  const amount = (amountMinor / 100).toLocaleString("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
  return cadence === "session"
    ? `Starting from ${amount}/session`
    : `Starting from ${amount}/month`;
}

function normalizeAdminService(value: unknown): AdvisorAdminService | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const code = typeof row["code"] === "string" ? row["code"] : "";
  if (code !== "bookkeeping" && code !== "coaching") return null;
  const fallback = defaultAdminCatalogue().services.find((service) => service.code === code)!;
  const plansRaw = Array.isArray(row["plans"]) ? row["plans"] : fallback.plans;
  const plans = plansRaw
    .map((plan) => normalizeAdminPlan(plan, code, fallback.plans))
    .filter((plan): plan is AdvisorAdminPlan => Boolean(plan))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const cadence: AdvisorBillingCadence =
    row["cadence"] === "session" || row["cadence"] === "month" ? row["cadence"] : fallback.cadence;
  return {
    ...fallback,
    code,
    name: stringOr(row["name"], fallback.name),
    headline: stringOr(row["headline"], fallback.headline),
    description: stringOr(row["description"], fallback.description),
    ctaLabel: stringOr(row["ctaLabel"] ?? row["cta_label"], fallback.ctaLabel),
    startingAmountMinor: numberOr(
      row["startingAmountMinor"] ?? row["starting_amount_minor"],
      fallback.startingAmountMinor,
    ),
    currency: stringOr(row["currency"], fallback.currency),
    cadence,
    startingLabel: stringOr(row["startingLabel"] ?? row["starting_label"], fallback.startingLabel),
    benefits: normalizeBenefits(row["benefits"], fallback.benefits),
    illustrationKey: fallback.illustrationKey,
    sortOrder: numberOr(row["sortOrder"] ?? row["sort_order"], fallback.sortOrder),
    isPublished: booleanOr(row["isPublished"] ?? row["is_published"], true),
    isEnabled: booleanOr(row["isEnabled"] ?? row["is_enabled"], true),
    chatWelcome: stringOr(row["chatWelcome"] ?? row["chat_welcome"], fallback.chatWelcome),
    exclusions: stringArray(row["exclusions"], fallback.exclusions),
    plans: plans.length > 0 ? plans : fallback.plans,
  };
}

function normalizeAdminPlan(
  value: unknown,
  serviceCode: "bookkeeping" | "coaching",
  fallbackPlans: AdvisorAdminPlan[],
): AdvisorAdminPlan | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const code = typeof row["code"] === "string" ? row["code"].trim() : "";
  if (!code) return null;
  const fallback =
    fallbackPlans.find((plan) => plan.code === code) ??
    enrichPlan({
      code: code as AdvisorServicePlan["code"],
      serviceCode,
      name: code,
      audience: "",
      summary: "",
      amountMinor: 0,
      currency: "USD",
      cadence: "month",
      sortOrder: 100,
      inclusions: [],
    });
  const cadence: AdvisorBillingCadence =
    row["cadence"] === "session" || row["cadence"] === "month" ? row["cadence"] : fallback.cadence;
  return {
    ...fallback,
    code: code as AdvisorServicePlan["code"],
    serviceCode,
    name: stringOr(row["name"], fallback.name),
    audience: stringOr(row["audience"], fallback.audience),
    summary: stringOr(row["summary"], fallback.summary),
    amountMinor: numberOr(row["amountMinor"] ?? row["amount_minor"], fallback.amountMinor),
    currency: stringOr(row["currency"], fallback.currency),
    cadence,
    sortOrder: numberOr(row["sortOrder"] ?? row["sort_order"], fallback.sortOrder),
    inclusions: stringArray(row["inclusions"], fallback.inclusions),
    isPublished: booleanOr(row["isPublished"] ?? row["is_published"], fallback.isPublished),
    isEnabled: booleanOr(row["isEnabled"] ?? row["is_enabled"], fallback.isEnabled),
    isArchived: booleanOr(row["isArchived"] ?? row["is_archived"], fallback.isArchived),
    sessionDurationMinutes: nullableNumber(
      row["sessionDurationMinutes"] ?? row["session_duration_minutes"],
      fallback.sessionDurationMinutes,
    ),
    transactionLimit: nullableNumber(
      row["transactionLimit"] ?? row["transaction_limit"],
      fallback.transactionLimit,
    ),
    accountLimit: nullableNumber(
      row["accountLimit"] ?? row["account_limit"],
      fallback.accountLimit,
    ),
    sessionsIncluded: nullableNumber(
      row["sessionsIncluded"] ?? row["sessions_included"],
      fallback.sessionsIncluded,
    ),
    annualAmountMinor: nullableNumber(
      row["annualAmountMinor"] ?? row["annual_amount_minor"],
      fallback.annualAmountMinor,
    ),
    features: stringArray(row["features"], fallback.features),
  };
}

function normalizeBenefits(
  value: unknown,
  fallback: AdvisorServiceBenefit[],
): AdvisorServiceBenefit[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  const benefits: AdvisorServiceBenefit[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      benefits.push({ key: item.trim().toLowerCase().replace(/\s+/g, "_"), label: item.trim() });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const label = stringOr(row["label"], "");
    if (!label) continue;
    benefits.push({
      key: stringOr(row["key"], label.toLowerCase().replace(/\s+/g, "_")),
      label,
    });
  }
  return benefits.length > 0 ? benefits : fallback;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableNumber(value: unknown, fallback: number | null): number | null {
  if (value === null || value === undefined || value === "") return fallback;
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value.filter(
    (item): item is string => typeof item === "string" && Boolean(item.trim()),
  );
  return items.length > 0 ? items : fallback;
}
