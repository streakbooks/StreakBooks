/**
 * LinkBooks Advisors public catalogue defaults.
 * Database-published rows override these when the Advisors migration is applied.
 * Prices are proposed defaults only — administrators change them in later batches.
 */

export type AdvisorServiceCode = "bookkeeping" | "coaching";

export type AdvisorPlanCode =
  | "essential_books"
  | "growth_books"
  | "complete_books"
  | "quick_guidance"
  | "monthly_coaching"
  | "business_coaching";

export type AdvisorBillingCadence = "month" | "session";

export type AdvisorServiceBenefit = {
  key: string;
  label: string;
};

export type AdvisorServicePlan = {
  code: AdvisorPlanCode;
  serviceCode: AdvisorServiceCode;
  name: string;
  audience: string;
  summary: string;
  amountMinor: number;
  currency: string;
  cadence: AdvisorBillingCadence;
  sortOrder: number;
  inclusions: string[];
};

export type AdvisorService = {
  code: AdvisorServiceCode;
  name: string;
  headline: string;
  description: string;
  ctaLabel: string;
  startingAmountMinor: number;
  currency: string;
  cadence: AdvisorBillingCadence;
  startingLabel: string;
  benefits: AdvisorServiceBenefit[];
  illustrationKey: "we-do-your-books" | "we-coach-you";
  sortOrder: number;
  plans: AdvisorServicePlan[];
};

export const ADVISORS_EXCLUSIONS = [
  "Historical bookkeeping cleanup",
  "Tax return preparation and filing",
  "Statutory representation",
  "Payroll processing",
  "Complex inventory valuation",
  "Audits and assurance",
  "Extraordinary transaction volumes",
  "Specialized compliance services",
] as const;

export const ADVISORS_LANDING = {
  brandTitle: "LinkBooks Advisors",
  heading: "Your business deserves better financial clarity.",
  supporting: "Choose expert bookkeeping support or learn to manage your books with confidence.",
} as const;

const BOOKKEEPING_PLANS: AdvisorServicePlan[] = [
  {
    code: "essential_books",
    serviceCode: "bookkeeping",
    name: "Essential Books",
    audience: "For small businesses.",
    summary: "Core monthly bookkeeping with essential reports.",
    amountMinor: 19_900,
    currency: "USD",
    cadence: "month",
    sortOrder: 10,
    inclusions: [
      "Up to 100 monthly transactions",
      "Up to 2 bank or credit accounts",
      "Monthly transaction categorization",
      "Bank reconciliation",
      "Monthly Profit & Loss",
      "Monthly Balance Sheet",
      "Organized year-end bookkeeping records",
      "Standard customer support",
    ],
  },
  {
    code: "growth_books",
    serviceCode: "bookkeeping",
    name: "Growth Books",
    audience: "For growing businesses.",
    summary: "Everything in Essential plus AP/AR tracking and a monthly advisor meeting.",
    amountMinor: 34_900,
    currency: "USD",
    cadence: "month",
    sortOrder: 20,
    inclusions: [
      "Everything in Essential",
      "Up to 300 monthly transactions",
      "Up to 5 bank or credit accounts",
      "Accounts payable and receivable tracking",
      "Monthly financial review",
      "Basic management reporting",
      "One 30-minute advisor meeting per month",
      "Priority support",
    ],
  },
  {
    code: "complete_books",
    serviceCode: "bookkeeping",
    name: "Complete Books",
    audience: "For businesses needing advanced bookkeeping support.",
    summary: "Higher volume limits, custom reporting and dedicated advisor support.",
    amountMinor: 59_900,
    currency: "USD",
    cadence: "month",
    sortOrder: 30,
    inclusions: [
      "Everything in Growth",
      "Up to 600 monthly transactions",
      "Up to 10 bank or credit accounts",
      "Advanced management reporting",
      "Custom reporting",
      "Multi-account reconciliation",
      "One 60-minute advisor meeting per month",
      "Dedicated advisor support",
    ],
  },
];

const COACHING_PLANS: AdvisorServicePlan[] = [
  {
    code: "quick_guidance",
    serviceCode: "coaching",
    name: "Quick Guidance",
    audience: "Focused one-off help.",
    summary: "One personalized coaching session.",
    amountMinor: 7_900,
    currency: "USD",
    cadence: "session",
    sortOrder: 10,
    inclusions: [
      "One 45-minute session",
      "Personalized bookkeeping assistance",
      "Software or reporting guidance",
    ],
  },
  {
    code: "monthly_coaching",
    serviceCode: "coaching",
    name: "Monthly Coaching",
    audience: "Steady monthly guidance.",
    summary: "Two coaching sessions each month with follow-up support.",
    amountMinor: 14_900,
    currency: "USD",
    cadence: "month",
    sortOrder: 20,
    inclusions: [
      "Two 45-minute sessions monthly",
      "Bookkeeping questions and guidance",
      "Financial report explanations",
      "Follow-up support",
    ],
  },
  {
    code: "business_coaching",
    serviceCode: "coaching",
    name: "Business Coaching",
    audience: "Intensive coaching cadence.",
    summary: "Four sessions monthly with prioritized guidance.",
    amountMinor: 24_900,
    currency: "USD",
    cadence: "month",
    sortOrder: 30,
    inclusions: [
      "Four coaching sessions monthly",
      "Bookkeeping reviews",
      "Personalized improvement recommendations",
      "Priority guidance",
    ],
  },
];

export const DEFAULT_ADVISOR_SERVICES: AdvisorService[] = [
  {
    code: "bookkeeping",
    name: "We do your books",
    headline: "We do your books",
    description:
      "Stay focused on your business while our bookkeeping team keeps your financial records organized, accurate and ready for review.",
    ctaLabel: "Choose this service",
    startingAmountMinor: 19_900,
    currency: "USD",
    cadence: "month",
    startingLabel: "Starting from $199/month",
    benefits: [
      { key: "monthly", label: "Monthly bookkeeping" },
      { key: "categorization", label: "Transaction categorization" },
      { key: "reconciliation", label: "Bank reconciliation" },
      { key: "reports", label: "Financial reports" },
      { key: "year_end", label: "Organized year-end records" },
      { key: "support", label: "Professional bookkeeping support" },
    ],
    illustrationKey: "we-do-your-books",
    sortOrder: 10,
    plans: BOOKKEEPING_PLANS,
  },
  {
    code: "coaching",
    name: "We coach you",
    headline: "We coach you",
    description:
      "Build confidence in your bookkeeping with practical, personalized guidance from an experienced advisor.",
    ctaLabel: "Choose this service",
    startingAmountMinor: 7_900,
    currency: "USD",
    cadence: "session",
    startingLabel: "Starting from $79/session",
    benefits: [
      { key: "one_to_one", label: "One-to-one coaching" },
      { key: "software", label: "Accounting software guidance" },
      { key: "training", label: "Bookkeeping training" },
      { key: "explanations", label: "Financial report explanations" },
      { key: "support", label: "Personalized support" },
    ],
    illustrationKey: "we-coach-you",
    sortOrder: 20,
    plans: COACHING_PLANS,
  },
];

export function isAdvisorServiceCode(value: string): value is AdvisorServiceCode {
  return value === "bookkeeping" || value === "coaching";
}

export function getDefaultAdvisorService(code: AdvisorServiceCode): AdvisorService {
  const found = DEFAULT_ADVISOR_SERVICES.find((service) => service.code === code);
  if (!found) throw new Error(`Unknown Advisors service: ${code}`);
  return found;
}

export function formatAdvisorStartingPrice(service: Pick<AdvisorService, "startingLabel">): string {
  return service.startingLabel;
}

export function formatAdvisorPlanPrice(plan: AdvisorServicePlan): string {
  const amount = (plan.amountMinor / 100).toLocaleString("en-US", {
    style: "currency",
    currency: plan.currency,
    maximumFractionDigits: 0,
  });
  return plan.cadence === "session" ? `${amount}/session` : `${amount}/month`;
}

/** Normalize a public RPC / JSON payload into catalogue services with safe defaults. */
export function normalizePublicAdvisorCatalogue(input: unknown): AdvisorService[] {
  if (!Array.isArray(input) || input.length === 0) return DEFAULT_ADVISOR_SERVICES;
  const byCode = new Map(DEFAULT_ADVISOR_SERVICES.map((service) => [service.code, service]));
  const normalized: AdvisorService[] = [];
  for (const row of input) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const code = typeof record["code"] === "string" ? record["code"] : "";
    if (!isAdvisorServiceCode(code)) continue;
    const fallback = byCode.get(code)!;
    const plansRaw = Array.isArray(record["plans"]) ? record["plans"] : fallback.plans;
    const plans = plansRaw
      .map((plan) => normalizePlan(plan, code, fallback.plans))
      .filter((plan): plan is AdvisorServicePlan => Boolean(plan))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const cadenceValue = record["cadence"];
    normalized.push({
      ...fallback,
      name: stringOr(record["name"], fallback.name),
      headline: stringOr(record["headline"], fallback.headline),
      description: stringOr(record["description"], fallback.description),
      ctaLabel: stringOr(record["ctaLabel"] ?? record["cta_label"], fallback.ctaLabel),
      startingAmountMinor: numberOr(
        record["startingAmountMinor"] ?? record["starting_amount_minor"],
        fallback.startingAmountMinor,
      ),
      currency: stringOr(record["currency"], fallback.currency),
      cadence:
        cadenceValue === "session" || cadenceValue === "month" ? cadenceValue : fallback.cadence,
      startingLabel: stringOr(
        record["startingLabel"] ?? record["starting_label"],
        fallback.startingLabel,
      ),
      benefits: normalizeBenefits(record["benefits"], fallback.benefits),
      sortOrder: numberOr(record["sortOrder"] ?? record["sort_order"], fallback.sortOrder),
      plans: plans.length > 0 ? plans : fallback.plans,
    });
  }
  return normalized.length > 0
    ? normalized.sort((a, b) => a.sortOrder - b.sortOrder)
    : DEFAULT_ADVISOR_SERVICES;
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

function normalizePlan(
  value: unknown,
  serviceCode: AdvisorServiceCode,
  fallbackPlans: AdvisorServicePlan[],
): AdvisorServicePlan | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const code = typeof row["code"] === "string" ? row["code"] : "";
  const fallback = fallbackPlans.find((plan) => plan.code === code);
  if (!fallback) return null;
  const inclusionsRaw = row["inclusions"] ?? row["features"];
  const inclusions = Array.isArray(inclusionsRaw)
    ? inclusionsRaw.filter(
        (item): item is string => typeof item === "string" && Boolean(item.trim()),
      )
    : fallback.inclusions;
  const cadenceValue = row["cadence"];
  return {
    ...fallback,
    serviceCode,
    name: stringOr(row["name"], fallback.name),
    audience: stringOr(row["audience"], fallback.audience),
    summary: stringOr(row["summary"], fallback.summary),
    amountMinor: numberOr(row["amountMinor"] ?? row["amount_minor"], fallback.amountMinor),
    currency: stringOr(row["currency"], fallback.currency),
    cadence:
      cadenceValue === "session" || cadenceValue === "month" ? cadenceValue : fallback.cadence,
    sortOrder: numberOr(row["sortOrder"] ?? row["sort_order"], fallback.sortOrder),
    inclusions: inclusions.length > 0 ? inclusions : fallback.inclusions,
  };
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
