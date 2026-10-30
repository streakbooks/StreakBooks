/**
 * LinkBooks plan maths. Amounts are minor units (pence, cents, paise).
 *
 * Standing list prices (October 2026), per organisation per month:
 * Xero Early $27 / Growing $59 / Established $97
 * QuickBooks Simple Start $38 / Essentials $85 / Plus $140 / Advanced $340
 * Zoho Books Standard $15 / Professional $40 / Premium $60
 * FreshBooks Lite $23 / Plus $43 / Premium $70
 * Wave Pro $19
 * Sage Accounting Start about $20
 * Akaunting-style cloud $8 / $24 / $56 / $145
 *
 * LinkBooks sits under Xero and QuickBooks on every paid tier, and under
 * Zoho Professional / FreshBooks Plus on Standard. Starter is level with
 * Zoho Standard and Wave Pro. The ledger is the same engine on every plan;
 * limits are seats, document volume and multi-currency, not a weaker posting
 * engine. Prices, trial length, annual free months and promo codes are stored
 * in the database so they can change without a release.
 */

export const BILLING_CURRENCIES = ["GBP", "USD", "INR"] as const;
export type BillingCurrency = (typeof BILLING_CURRENCIES)[number];

export const PLAN_CODES = ["starter", "standard", "premium", "practice"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const DEFAULT_TRIAL_DAYS = 30;
export const DEFAULT_ANNUAL_FREE_MONTHS = 2;
export const DEFAULT_TRIAL_PLAN: PlanCode = "standard";
export const DEFAULT_GRACE_DAYS = 7;

export type PlanLimits = {
  users: number;
  invoicesPerMonth: number | null;
  billsPerMonth: number | null;
  multiCurrency: boolean;
};

export type CatalogPlan = {
  code: PlanCode;
  name: string;
  audience: string;
  summary: string;
  /** Monthly price in minor units, keyed by billing currency. */
  monthly: Record<BillingCurrency, number>;
  limits: PlanLimits;
  highlights: string[];
};

export const CATALOG: readonly CatalogPlan[] = [
  {
    code: "starter",
    name: "Starter",
    audience: "Sole traders",
    summary: "Full double-entry books for a one-person business.",
    monthly: { GBP: 1200, USD: 1500, INR: 49900 },
    limits: { users: 2, invoicesPerMonth: 20, billsPerMonth: 5, multiCurrency: false },
    highlights: [
      "Quotes, invoices, bills, VAT and reports",
      "Bank reconciliation",
      "2 users, including an accountant",
      "20 invoices and 5 bills a month",
    ],
  },
  {
    code: "standard",
    name: "Standard",
    audience: "Growing businesses",
    summary: "Unlimited documents, multi-currency and projects.",
    monthly: { GBP: 2900, USD: 3500, INR: 149900 },
    limits: { users: 5, invoicesPerMonth: null, billsPerMonth: null, multiCurrency: true },
    highlights: [
      "Everything in Starter",
      "Unlimited invoices and bills",
      "5 users",
      "Multi-currency and projects",
      "Bank rules",
    ],
  },
  {
    code: "premium",
    name: "Premium",
    audience: "Established businesses",
    summary: "More seats, fixed assets, budgets and expense approvals.",
    monthly: { GBP: 4900, USD: 5900, INR: 299900 },
    limits: { users: 10, invoicesPerMonth: null, billsPerMonth: null, multiCurrency: true },
    highlights: [
      "Everything in Standard",
      "10 users",
      "Fixed assets and budgets",
      "Expense approvals",
    ],
  },
  {
    code: "practice",
    name: "Practice",
    audience: "Accountants",
    summary: "Firm tools and a larger team on the same ledger.",
    monthly: { GBP: 9900, USD: 11900, INR: 599900 },
    limits: { users: 25, invoicesPerMonth: null, billsPerMonth: null, multiCurrency: true },
    highlights: ["Everything in Premium", "25 users", "Accountant and firm workspace"],
  },
] as const;

export type OfferKind = "percent" | "amount" | "extra_trial_days" | "extra_free_months";
export type BillingInterval = "month" | "year";

export type OfferRule = {
  code: string;
  kind: OfferKind;
  /** Basis points for percent (2000 = 20%). Ignored for other kinds. */
  percentBps: number;
  /** Minor units taken off the due amount. Must match the checkout currency. */
  amountMinor: number;
  amountCurrency: BillingCurrency | null;
  extraTrialDays: number;
  extraFreeMonths: number;
  intervals: BillingInterval[] | "any";
  planCodes: PlanCode[] | "any";
  startsOn: string | null;
  endsOn: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  active: boolean;
};

export type QuoteInput = {
  monthlyMinor: number;
  interval: BillingInterval;
  annualFreeMonths: number;
  currency: BillingCurrency;
  trialDays: number;
  offer: OfferRule | null;
  now: Date;
  planCode: PlanCode;
};

export type PriceQuote = {
  currency: BillingCurrency;
  interval: BillingInterval;
  listMinor: number;
  discountMinor: number;
  dueMinor: number;
  freeMonths: number;
  trialDays: number;
  offerCode: string | null;
};

export function isBillingCurrency(value: string): value is BillingCurrency {
  return (BILLING_CURRENCIES as readonly string[]).includes(value);
}

export function isPlanCode(value: string): value is PlanCode {
  return (PLAN_CODES as readonly string[]).includes(value);
}

export function billingCurrencyForCompany(baseCurrency: string): BillingCurrency {
  const code = baseCurrency.trim().toUpperCase();
  return isBillingCurrency(code) ? code : "GBP";
}

export function planByCode(code: string): CatalogPlan | null {
  return CATALOG.find((plan) => plan.code === code) ?? null;
}

export function annualFreeMonthsOrThrow(freeMonths: number): number {
  if (!Number.isInteger(freeMonths) || freeMonths < 0 || freeMonths > 11) {
    throw new Error("Annual free months must be a whole number from 0 to 11.");
  }
  return freeMonths;
}

/** List price for the interval before a promo code. Annual charges (12 − free months) × monthly. */
export function listAmount(
  monthlyMinor: number,
  interval: BillingInterval,
  freeMonths: number,
): number {
  if (!Number.isInteger(monthlyMinor) || monthlyMinor < 0) {
    throw new Error("Monthly price must be zero or a positive number of minor units.");
  }
  const monthsFree = annualFreeMonthsOrThrow(freeMonths);
  if (interval === "month") return monthlyMinor;
  return monthlyMinor * (12 - monthsFree);
}

export function quotePrice(input: QuoteInput): PriceQuote {
  const offer = input.offer ? assertOfferApplies(input.offer, input) : null;
  const freeMonths = annualFreeMonthsOrThrow(
    input.annualFreeMonths + (offer?.kind === "extra_free_months" ? offer.extraFreeMonths : 0),
  );
  const listMinor = listAmount(input.monthlyMinor, input.interval, input.annualFreeMonths);
  const adjustedList =
    offer?.kind === "extra_free_months" && input.interval === "year"
      ? listAmount(input.monthlyMinor, "year", freeMonths)
      : listMinor;
  let discountMinor = 0;
  if (offer?.kind === "percent") {
    discountMinor = Math.floor((adjustedList * offer.percentBps) / 10_000);
  } else if (offer?.kind === "amount") {
    discountMinor = Math.min(adjustedList, offer.amountMinor);
  } else if (offer?.kind === "extra_free_months" && input.interval === "year") {
    discountMinor = listMinor - adjustedList;
  }
  const dueMinor =
    offer?.kind === "extra_free_months" ? adjustedList : adjustedList - discountMinor;
  const trialDays =
    input.trialDays + (offer?.kind === "extra_trial_days" ? offer.extraTrialDays : 0);
  return {
    currency: input.currency,
    interval: input.interval,
    listMinor: offer?.kind === "extra_free_months" ? listMinor : adjustedList,
    discountMinor,
    dueMinor,
    freeMonths: input.interval === "year" ? freeMonths : 0,
    trialDays,
    offerCode: offer?.code ?? null,
  };
}

function assertOfferApplies(offer: OfferRule, input: QuoteInput): OfferRule {
  const code = offer.code.trim().toUpperCase();
  if (!offer.active) throw new Error(`Promo code ${code} is not active.`);
  if (offer.maxRedemptions != null && offer.redemptionCount >= offer.maxRedemptions) {
    throw new Error(`Promo code ${code} has been fully used.`);
  }
  const day = input.now.toISOString().slice(0, 10);
  if (offer.startsOn && day < offer.startsOn)
    throw new Error(`Promo code ${code} is not open yet.`);
  if (offer.endsOn && day > offer.endsOn) throw new Error(`Promo code ${code} has expired.`);
  if (offer.intervals !== "any" && !offer.intervals.includes(input.interval)) {
    throw new Error(
      `Promo code ${code} does not apply to ${input.interval === "year" ? "annual" : "monthly"} billing.`,
    );
  }
  if (offer.planCodes !== "any" && !offer.planCodes.includes(input.planCode)) {
    throw new Error(`Promo code ${code} does not apply to this plan.`);
  }
  if (offer.kind === "percent" && (offer.percentBps < 1 || offer.percentBps > 10_000)) {
    throw new Error(`Promo code ${code} has an invalid percentage.`);
  }
  if (offer.kind === "amount") {
    if (offer.amountCurrency !== input.currency) {
      throw new Error(
        `Promo code ${code} is priced in ${offer.amountCurrency ?? "another currency"}.`,
      );
    }
    if (offer.amountMinor < 1) throw new Error(`Promo code ${code} has an invalid amount.`);
  }
  if (offer.kind === "extra_free_months") {
    if (input.interval !== "year")
      throw new Error(`Promo code ${code} only applies to annual billing.`);
    annualFreeMonthsOrThrow(input.annualFreeMonths + offer.extraFreeMonths);
  }
  if (offer.kind === "extra_trial_days" && offer.extraTrialDays < 1) {
    throw new Error(`Promo code ${code} has an invalid trial extension.`);
  }
  return { ...offer, code };
}

export type SubscriptionAccessInput = {
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  now: Date;
  graceDays: number;
};

/** Read-only when the trial or paid period has finished. Reports stay available. */
export function subscriptionAccess(input: SubscriptionAccessInput): "full" | "read_only" {
  const now = input.now.getTime();
  if (input.status === "complimentary") return "full";
  if (input.status === "trialing") {
    return input.trialEndsAt != null && Date.parse(input.trialEndsAt) > now ? "full" : "read_only";
  }
  if (input.status === "active" || input.status === "cancelled") {
    if (input.currentPeriodEnd == null) return "full";
    return Date.parse(input.currentPeriodEnd) > now ? "full" : "read_only";
  }
  if (input.status === "past_due") {
    if (input.currentPeriodEnd == null) return "full";
    const graceMs = Math.max(0, input.graceDays) * 24 * 60 * 60 * 1000;
    return Date.parse(input.currentPeriodEnd) + graceMs > now ? "full" : "read_only";
  }
  return "read_only";
}

export function formatMinor(amountMinor: number, currency: BillingCurrency): string {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}
