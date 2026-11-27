import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { assertCheckoutRegion, resolveBillingRegion } from "@/lib/billing/region";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import {
  isPayMethodId,
  parseCheckoutBilling,
  razorpayPlanBody,
  razorpaySubscriptionBody,
  stripeCheckoutBody,
  trialEndUnixOrNull,
  type CheckoutBilling,
  type CheckoutBillingInput,
  type PayMethodId,
} from "@/lib/billing/checkout-payload";
import {
  assertProviderRouted,
  normaliseRoutedProviders,
  paymentMethodsForRoutedCountry,
  type BillingProviderId,
} from "@/lib/billing/provider-resolution";
import {
  DEFAULT_TRIAL_DAYS,
  DEFAULT_TRIAL_PLAN,
  isBillingCurrency,
  isPlanCode,
  planByCode,
  quotePrice,
  subscriptionAccess,
  type BillingCurrency,
  type BillingInterval,
  type OfferRule,
  type PlanCode,
  type PriceQuote,
} from "@/lib/billing/pricing";
import { planPrice, type PriceList } from "@/lib/billing/domain/country-pricing";
import { providerAddsTax, type CheckoutTax } from "@/lib/billing/domain/tax";
import { assertDiscountCap, assertPriceFloor } from "@/lib/billing/provider-actions";
import { assertRazorpayTestKey, assertStripeTestKey } from "@/lib/billing/provider-keys";
import {
  assertNoRecentOpenCheckout,
  expireStaleOpenCheckouts,
  subscriptionSuccessUrl,
} from "@/lib/billing/checkout-confirm.server";

type Client = SupabaseClient<Database>;

/** Visitor country from the edge, when the call runs inside a server-function request. */
function visitorCountry(): string | undefined {
  try {
    return getRequestHeader("x-vercel-ip-country");
  } catch {
    return undefined;
  }
}

export type BillingPlanView = {
  code: string;
  name: string;
  audience: string;
  summary: string;
  /** Null until the plan has a published price (price-book plans before phase 3). */
  monthlyMinor: number | null;
  /**
   * True when the country price book has a purchasable amount for this plan.
   * Independent of whether Stripe/Razorpay API keys are present on the server.
   */
  pricePublished: boolean;
  /**
   * True when Subscribe can open checkout (published price + routed provider configured).
   * False with a published price means server payment credentials are missing.
   */
  checkoutReady: boolean;
  monthlyGbp: number;
  monthlyUsd: number;
  monthlyInr: number;
  users: number;
  invoicesPerMonth: number | null;
  billsPerMonth: number | null;
  multiCurrency: boolean;
  highlights: string[];
  active: boolean;
  isPublic: boolean;
  rank: number;
  trialEnabled: boolean;
  trialDays: number;
  /** Published country price for display; buying it opens with the phase 5 checkout. */
  listPrice: { currency: string; monthlyMinor: number | null; yearlyMinor: number | null } | null;
};

export type BillingOfferView = {
  code: string;
  name: string;
  kind: string;
  percentBps: number;
  amountMinor: number;
  amountCurrency: string | null;
  extraTrialDays: number;
  extraFreeMonths: number;
  intervals: string;
  planCodes: string[];
  startsOn: string | null;
  endsOn: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  active: boolean;
};

export type BillingOverview = {
  ready: boolean;
  message: string | null;
  companyName: string;
  countryCode: string;
  isDemo: boolean;
  currency: BillingCurrency;
  access: "full" | "read_only";
  subscription: {
    planCode: string;
    planName: string;
    status: string;
    interval: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    provider: string;
    cancelAtPeriodEnd: boolean;
    offerCode: string | null;
    /** Downgrade scheduled at period end (industry standard). */
    scheduledPlanCode: string | null;
    scheduledAt: string | null;
  } | null;
  usage: { invoicesThisMonth: number; billsThisMonth: number; users: number };
  plans: BillingPlanView[];
  settings: {
    trialDays: number;
    trialPlanCode: string;
    annualFreeMonths: number;
    pastDueGraceDays: number;
  };
  offers: BillingOfferView[];
  /** Server env keys present (not country routing). */
  providers: { stripe: boolean; razorpay: boolean };
  /** Country routes from `billing.country_providers` via the price list. */
  routedProviders: BillingProviderId[];
  isOperator: boolean;
};

const MIGRATION_MESSAGE =
  "Subscriptions need a database update that has not been applied yet (migration 20261030120000). Ask an administrator to apply the latest migrations.";

function missingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42883" ||
    /billing_|lookup_billing_offer|start_company_trial|is_billing_operator/i.test(
      error.message ?? "",
    )
  );
}

function monthStartIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function highlightsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

type PlanRow = {
  code: string;
  name: string;
  audience: string;
  summary: string;
  monthly_gbp: number;
  monthly_usd: number;
  monthly_inr: number;
  users_included: number;
  invoices_per_month: number | null;
  bills_per_month: number | null;
  multi_currency: boolean;
  highlights: unknown;
  sort_order: number;
  is_active: boolean;
  is_public?: boolean;
  plan_rank?: number;
  trial_enabled?: boolean;
  trial_days?: number;
  pricing_source?: string;
};

function hasLegacyPrice(plan: PlanRow): boolean {
  return (plan.pricing_source ?? "legacy") === "legacy";
}

function monthlyMinor(plan: PlanRow, currency: BillingCurrency): number | null {
  if (!hasLegacyPrice(plan)) return null;
  if (currency === "USD") return plan.monthly_usd;
  if (currency === "INR") return plan.monthly_inr;
  if (currency === "GBP") return plan.monthly_gbp;
  return planByCode(plan.code)?.monthly[currency] ?? plan.monthly_gbp;
}

function toPlanView(plan: PlanRow, currency: BillingCurrency): BillingPlanView {
  const published = hasLegacyPrice(plan);
  return {
    code: plan.code,
    name: plan.name,
    audience: plan.audience,
    summary: plan.summary,
    monthlyMinor: monthlyMinor(plan, currency),
    pricePublished: published,
    checkoutReady: published,
    monthlyGbp: plan.monthly_gbp,
    monthlyUsd: plan.monthly_usd,
    monthlyInr: plan.monthly_inr,
    users: plan.users_included,
    invoicesPerMonth: plan.invoices_per_month,
    billsPerMonth: plan.bills_per_month,
    multiCurrency: plan.multi_currency,
    highlights: highlightsOf(plan.highlights),
    active: plan.is_active,
    isPublic: plan.is_public ?? true,
    rank: plan.plan_rank ?? plan.sort_order,
    trialEnabled: plan.trial_enabled ?? true,
    trialDays: plan.trial_days ?? DEFAULT_TRIAL_DAYS,
    listPrice: null,
  };
}

function withListPrice(plan: BillingPlanView, list: PriceList | null): BillingPlanView {
  const flags = providerFlags();
  const routedReady = (providers: string[] | null | undefined) =>
    (providers ?? []).some((provider) => flags[provider as "stripe" | "razorpay"]);

  if (plan.pricePublished) {
    const ready = list ? routedReady(list.providers) : Boolean(flags.stripe || flags.razorpay);
    return { ...plan, checkoutReady: ready };
  }
  if (!list) return { ...plan, checkoutReady: false };

  const month = planPrice(list, plan.code, "month");
  const year = planPrice(list, plan.code, "year");
  const currency = month?.currency ?? year?.currency;
  if (!currency) return { ...plan, checkoutReady: false };
  const catalogReady =
    month !== null && list.billingEnabled === true && isBillingCurrency(currency);
  const providerReady = routedReady(list.providers);
  return {
    ...plan,
    pricePublished: catalogReady,
    checkoutReady: catalogReady && providerReady,
    listPrice: {
      currency,
      monthlyMinor: month?.amountMinor ?? null,
      yearlyMinor: year?.currency === currency ? year.amountMinor : null,
    },
  };
}

type OfferRow = {
  code: string;
  name?: string;
  kind: string;
  percent_bps: number;
  amount_minor: number;
  amount_currency: string | null;
  extra_trial_days: number;
  extra_free_months: number;
  intervals: string;
  plan_codes: string[] | null;
  starts_on: string | null;
  ends_on: string | null;
  max_redemptions: number | null;
  redemption_count: number;
  is_active: boolean;
  duration_months?: number | null;
};

function toOfferRule(row: OfferRow): OfferRule {
  const kind = row.kind;
  if (
    kind !== "percent" &&
    kind !== "amount" &&
    kind !== "extra_trial_days" &&
    kind !== "extra_free_months"
  ) {
    throw new Error("This promo code is not a supported offer.");
  }
  const intervals: OfferRule["intervals"] =
    row.intervals === "month" || row.intervals === "year" ? [row.intervals] : "any";
  const planCodes = row.plan_codes?.filter(isPlanCode);
  return {
    code: row.code,
    kind,
    percentBps: row.percent_bps,
    amountMinor: row.amount_minor,
    amountCurrency:
      row.amount_currency && isBillingCurrency(row.amount_currency) ? row.amount_currency : null,
    extraTrialDays: row.extra_trial_days,
    extraFreeMonths: row.extra_free_months,
    durationMonths: row.duration_months ?? null,
    intervals,
    planCodes: row.plan_codes == null ? "any" : (planCodes ?? []),
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    maxRedemptions: row.max_redemptions,
    redemptionCount: row.redemption_count,
    active: row.is_active,
  };
}

function toOfferView(row: OfferRow & { name: string }): BillingOfferView {
  return {
    code: row.code,
    name: row.name,
    kind: row.kind,
    percentBps: row.percent_bps,
    amountMinor: row.amount_minor,
    amountCurrency: row.amount_currency,
    extraTrialDays: row.extra_trial_days,
    extraFreeMonths: row.extra_free_months,
    intervals: row.intervals,
    planCodes: row.plan_codes ?? [],
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    maxRedemptions: row.max_redemptions,
    redemptionCount: row.redemption_count,
    active: row.is_active,
  };
}

async function loadOffer(supabase: Client, code: string): Promise<OfferRule | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase.rpc(
    "lookup_billing_offer" as never,
    { _code: trimmed } as never,
  );
  if (error) {
    if (missingTable(error)) throw new Error(MIGRATION_MESSAGE);
    throw new Error(error.message);
  }
  const row = (Array.isArray(data) ? data[0] : data) as OfferRow | null;
  if (!row) throw new Error(`Promo code ${trimmed.toUpperCase()} was not found.`);
  return toOfferRule(row);
}

function assertInterval(value: string): BillingInterval {
  if (value !== "month" && value !== "year") throw new Error("Choose monthly or annual billing.");
  return value;
}

const LOCAL_ORIGINS = [
  "http://127.0.0.1:8080",
  "http://localhost:8080",
  "http://127.0.0.1:3000",
  "http://localhost:3000",
];

function assertOrigin(origin: string): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error("The return address is not valid.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("The return address is not valid.");
  if (url.username || url.password) throw new Error("The return address is not valid.");
  const allowed = new Set(LOCAL_ORIGINS);
  for (const key of ["APP_ORIGIN", "SITE_URL", "VITE_SITE_URL"] as const) {
    const value = process.env[key];
    if (!value) continue;
    try {
      allowed.add(new URL(value).origin);
    } catch {
      // Ignore a malformed configured origin.
    }
  }
  if (!allowed.has(url.origin)) throw new Error("The return address is not allowed.");
  return url.origin;
}

async function assertOperator(supabase: Client): Promise<void> {
  const { data, error } = await supabase.rpc("platform_role" as never);
  if (error) {
    if (missingTable(error)) {
      throw new Error(
        "Platform billing is not available until migration 20261030140000 is applied.",
      );
    }
    throw new Error(error.message);
  }
  if (data !== "platform_owner" && data !== "platform_finance") {
    throw new Error("Only platform billing staff can change plans, trials and promo codes.");
  }
}

const EMPTY_SETTINGS = {
  trialDays: DEFAULT_TRIAL_DAYS,
  trialPlanCode: DEFAULT_TRIAL_PLAN as string,
  annualFreeMonths: 2,
  pastDueGraceDays: 7,
};

export const getBillingOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: assertUuid(input?.companyId) }))
  .handler(async ({ data, context }): Promise<BillingOverview> => {
    const { supabase } = context;
    await assertCompanyMember(supabase, data.companyId);
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("name, is_demo, base_currency, country_code")
      .eq("id", data.companyId)
      .maybeSingle();
    if (companyError) throw new Error(companyError.message);
    if (!company) throw new Error("Company not found or you do not have access.");
    const region = resolveBillingRegion({
      organisationCountry: company.country_code,
      visitorCountry: getRequestHeader("x-vercel-ip-country"),
    });
    const currency = region.currency;

    const [settingsRes, plansRes, subRes, operatorRes] = await Promise.all([
      supabase
        .from("billing_settings" as never)
        .select("*" as never)
        .eq("id" as never, true as never)
        .maybeSingle(),
      supabase
        .from("billing_plans" as never)
        .select("*" as never)
        .order("sort_order" as never),
      supabase
        .from("company_subscriptions" as never)
        .select("*" as never)
        .eq("company_id" as never, data.companyId as never)
        .maybeSingle(),
      supabase.rpc("platform_role" as never),
    ]);
    if (
      missingTable(settingsRes.error) ||
      missingTable(plansRes.error) ||
      missingTable(subRes.error)
    ) {
      return {
        ready: false,
        message: MIGRATION_MESSAGE,
        companyName: company.name,
        countryCode: region.country,
        isDemo: company.is_demo,
        currency,
        access: "full",
        subscription: null,
        usage: { invoicesThisMonth: 0, billsThisMonth: 0, users: 0 },
        plans: [],
        settings: EMPTY_SETTINGS,
        offers: [],
        providers: providerFlags(),
        routedProviders: normaliseRoutedProviders(null, region.country),
        isOperator: false,
      };
    }
    if (settingsRes.error) throw new Error(settingsRes.error.message);
    if (plansRes.error) throw new Error(plansRes.error.message);
    if (subRes.error) throw new Error(subRes.error.message);

    const settingsRow = settingsRes.data as {
      trial_days: number;
      trial_plan_code: string;
      annual_free_months: number;
      past_due_grace_days: number;
    } | null;
    const priceListRes = await supabase.rpc(
      "billing_price_list" as never,
      { _country: company.country_code ?? region.country } as never,
    );
    const priceList = priceListRes.error ? null : (priceListRes.data as PriceList | null);
    const plans = ((plansRes.data ?? []) as unknown as PlanRow[]).map((plan) =>
      withListPrice(toPlanView(plan, currency), priceList),
    );
    const trialPlan = plans.find((plan) => plan.code === settingsRow?.trial_plan_code);
    const settings = settingsRow
      ? {
          trialDays: trialPlan?.trialDays ?? settingsRow.trial_days,
          trialPlanCode: settingsRow.trial_plan_code,
          annualFreeMonths: settingsRow.annual_free_months,
          pastDueGraceDays: settingsRow.past_due_grace_days,
        }
      : EMPTY_SETTINGS;
    const sub = subRes.data as {
      plan_code: string;
      status: string;
      billing_interval: string;
      trial_ends_at: string | null;
      current_period_end: string | null;
      provider: string;
      cancel_at_period_end: boolean;
      offer_code: string | null;
      scheduled_plan_code: string | null;
      scheduled_at: string | null;
    } | null;
    const planName =
      plans.find((plan) => plan.code === sub?.plan_code)?.name ?? sub?.plan_code ?? "";
    const access = company.is_demo
      ? "full"
      : sub
        ? subscriptionAccess({
            status: sub.status,
            trialEndsAt: sub.trial_ends_at,
            currentPeriodEnd: sub.current_period_end,
            now: new Date(),
            graceDays: settings.pastDueGraceDays,
          })
        : "read_only";
    const platformRole = operatorRes.error ? null : String(operatorRes.data ?? "");
    const isOperator =
      platformRole === "platform_owner" ||
      platformRole === "platform_finance" ||
      platformRole === "platform_support";
    const offers = isOperator ? await listOfferRows(supabase) : [];
    const usage = await usageCounts(supabase, data.companyId);

    return {
      ready: true,
      message: company.is_demo
        ? "Demo organisations keep the same ledger. Subscribe on a plan when you want a paid subscription."
        : access === "read_only"
          ? "This trial or subscription has ended. Reports stay available. Choose a plan to post again."
          : null,
      companyName: company.name,
      countryCode: region.country,
      isDemo: company.is_demo,
      currency,
      access,
      subscription: sub
        ? {
            planCode: sub.plan_code,
            planName,
            status: sub.status,
            interval: sub.billing_interval,
            trialEndsAt: sub.trial_ends_at,
            currentPeriodEnd: sub.current_period_end,
            provider: sub.provider,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            offerCode: sub.offer_code,
            scheduledPlanCode: sub.scheduled_plan_code,
            scheduledAt: sub.scheduled_at,
          }
        : null,
      usage,
      plans,
      settings,
      offers,
      providers: providerFlags(),
      routedProviders: normaliseRoutedProviders(priceList?.providers, region.country),
      isOperator,
    };
  });

function providerFlags(): { stripe: boolean; razorpay: boolean } {
  return {
    stripe: Boolean(process.env["STRIPE_SECRET_KEY"]),
    razorpay: Boolean(process.env["RAZORPAY_KEY_ID"] && process.env["RAZORPAY_KEY_SECRET"]),
  };
}

/** DB country routes; checkout snapshot first, then price list, then seed defaults. */
async function resolveRoutedProviders(
  supabase: Client,
  country: string,
  checkout: CheckoutPrice | null,
): Promise<BillingProviderId[]> {
  if (checkout?.providers?.length) {
    return normaliseRoutedProviders(checkout.providers, country);
  }
  const { data, error } = await supabase.rpc(
    "billing_price_list" as never,
    { _country: country } as never,
  );
  if (!error && data) {
    const list = data as PriceList;
    if (list.providers?.length) return normaliseRoutedProviders(list.providers, country);
  }
  return normaliseRoutedProviders(null, country);
}

async function usageCounts(supabase: Client, companyId: string) {
  const since = monthStartIso(new Date());
  const [invoices, bills, users] = await Promise.all([
    supabase
      .from("sales_invoices" as never)
      .select("id" as never, { count: "exact", head: true })
      .eq("company_id" as never, companyId as never)
      .gte("created_at" as never, since as never),
    supabase
      .from("purchase_bills" as never)
      .select("id" as never, { count: "exact", head: true })
      .eq("company_id" as never, companyId as never)
      .gte("created_at" as never, since as never),
    supabase
      .from("company_members")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "active"),
  ]);
  return {
    invoicesThisMonth: invoices.count ?? 0,
    billsThisMonth: bills.count ?? 0,
    users: users.count ?? 0,
  };
}

async function listOfferRows(supabase: Client): Promise<BillingOfferView[]> {
  const { data, error } = await supabase
    .from("billing_offers" as never)
    .select("*" as never)
    .order("code" as never);
  if (error) return [];
  return (data as unknown as Array<OfferRow & { name: string }>).map(toOfferView);
}

export const previewBillingQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { companyId: string; planCode: string; interval: string; offerCode?: string }) => ({
      companyId: assertUuid(input?.companyId),
      planCode: requirePlanCode(input?.planCode),
      interval: assertInterval(input?.interval),
      offerCode: (input?.offerCode ?? "").trim().slice(0, 40),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertCompanyMember(supabase, data.companyId);
    const priced = await priceSelection(
      supabase,
      data.companyId,
      data.planCode,
      data.interval,
      data.offerCode,
    );
    return priced.quote;
  });

export function parseTrialRequest(input: { companyId: string; planCode: string }) {
  return {
    companyId: assertUuid(input?.companyId),
    planCode: requirePlanCode(input?.planCode),
  };
}

export const startTrialFor = createServerOnlyFn(
  async (context: { supabase: Client }, data: ReturnType<typeof parseTrialRequest>) => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "billing.manage");
    const { data: ends, error } = await supabase.rpc(
      "start_company_trial" as never,
      { _company_id: data.companyId, _plan_code: data.planCode } as never,
    );
    if (error) {
      if (missingTable(error)) throw new Error(MIGRATION_MESSAGE);
      throw new Error(error.message);
    }
    return { trialEndsAt: String(ends) };
  },
);

export const startBillingTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseTrialRequest)
  .handler(({ data, context }) => startTrialFor(context, data));

export type CheckoutRequest = {
  companyId: string;
  planCode: string;
  interval: string;
  method: string;
  origin: string;
  offerCode?: string;
  billing?: CheckoutBillingInput;
};

export function parseCheckoutRequest(input: CheckoutRequest) {
  return {
    companyId: assertUuid(input?.companyId),
    planCode: requirePlanCode(input?.planCode),
    interval: assertInterval(input?.interval),
    method: requirePayMethod(input?.method),
    origin: assertOrigin(input?.origin ?? ""),
    offerCode: (input?.offerCode ?? "").trim().slice(0, 40),
    billing: parseCheckoutBilling(input?.billing),
  };
}

/** Opens a provider checkout; shared by the server function and REST v1. */
export const createCheckoutFor = createServerOnlyFn(
  async (
    context: { supabase: Client; userId: string },
    data: ReturnType<typeof parseCheckoutRequest>,
  ) => {
    const { supabase, userId } = context;
    await assertCompanyPermission(supabase, data.companyId, "billing.manage");
    const priced = await priceSelection(
      supabase,
      data.companyId,
      data.planCode,
      data.interval,
      data.offerCode,
    );
    assertCheckoutRegion(data.billing.country, priced.country);
    const routed = await resolveRoutedProviders(supabase, priced.country, priced.checkout);
    const method = paymentMethodsForRoutedCountry(priced.country, providerFlags(), routed).find(
      (item) => item.id === data.method,
    );
    if (!method?.available) {
      throw new Error(method?.reason ?? "That payment method is not available for this currency.");
    }
    if (priced.checkout && !priced.checkout.billingEnabled) {
      throw new Error(
        "Online payment is not open in your country yet. Your trial and records are not affected.",
      );
    }
    assertProviderRouted(method.provider, routed);
    if (priced.quote.recurringMinor < 1)
      throw new Error("The recurring price must be at least one minor unit.");
    // Do not open a second paid subscription for the same organisation.
    const existing = await loadSubscription(supabase, data.companyId);
    if (
      existing &&
      (existing.provider === "stripe" || existing.provider === "razorpay") &&
      ["active", "trialing", "past_due", "paused"].includes(existing.status)
    ) {
      throw new Error(
        "This organisation already has a payment subscription. Use Manage billing to change it.",
      );
    }
    await expireStaleOpenCheckouts(data.companyId);
    await assertNoRecentOpenCheckout(supabase, data.companyId);

    if (priced.checkout) {
      return openPriceBookCheckout({
        supabase,
        userId,
        companyId: data.companyId,
        origin: data.origin,
        billing: data.billing,
        provider: method.provider,
        payMethod: method.id,
        price: priced.checkout,
        trialEndsAt: existing?.trial_ends_at ?? null,
        offerCode: priced.quote.offerCode,
      });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("billing_checkouts" as never)
      .insert({
        company_id: data.companyId,
        plan_code: data.planCode,
        billing_interval: data.interval,
        provider: method.provider,
        currency: priced.currency,
        unit_amount_minor: priced.quote.recurringMinor,
        offer_code: priced.quote.offerCode,
        created_by: userId,
      } as never)
      .select("id" as never)
      .single();
    if (insertError) {
      if (missingTable(insertError)) throw new Error(MIGRATION_MESSAGE);
      throw new Error(insertError.message);
    }
    const checkoutId = (inserted as { id: string }).id;
    const sub = existing;
    const draft = {
      checkoutId,
      companyId: data.companyId,
      planCode: data.planCode,
      planName: priced.planName,
      interval: data.interval,
      currency: priced.currency,
      unitAmountMinor: priced.quote.recurringMinor,
      discountMinor: priced.quote.discountMinor,
      promoDurationMonths: priced.quote.promoDurationMonths,
      successUrl: subscriptionSuccessUrl(data.origin),
      cancelUrl: `${data.origin}/settings?section=subscription&checkout=cancel`,
      trialEndUnix: trialEndUnixOrNull(sub?.trial_ends_at ?? null, new Date()),
      billing: data.billing,
      payMethod: method.id,
    };
    const session =
      method.provider === "stripe"
        ? await openStripeCheckout(draft)
        : await openRazorpayCheckout(draft);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: updateError } = await supabaseAdmin
      .from("billing_checkouts" as never)
      .update({ provider_session_id: session.id } as never)
      .eq("id" as never, checkoutId as never);
    if (updateError) throw new Error(updateError.message);
    return { url: session.url, provider: method.provider, checkoutId };
  },
);

export const createBillingCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseCheckoutRequest)
  .handler(({ data, context }) => createCheckoutFor(context, data));

export const confirmBillingCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId?: string; sessionId?: string }) => {
    const sessionId = typeof input?.sessionId === "string" ? input.sessionId.trim() : "";
    if (!sessionId.startsWith("cs_")) throw new Error("Missing or invalid checkout session.");
    return { companyId: assertUuid(input?.companyId), sessionId };
  })
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "billing.manage");
    const { confirmStripeCheckoutSession } = await import("@/lib/billing/checkout-confirm.server");
    return confirmStripeCheckoutSession({
      companyId: data.companyId,
      sessionId: data.sessionId,
    });
  });

async function openPriceBookCheckout(input: {
  supabase: Client;
  userId: string;
  companyId: string;
  origin: string;
  billing: CheckoutBilling;
  provider: "stripe" | "razorpay";
  payMethod: PayMethodId;
  price: CheckoutPrice;
  trialEndsAt: string | null;
  offerCode: string | null;
}): Promise<{ url: string; provider: "stripe" | "razorpay"; checkoutId: string }> {
  const { ensureProviderPrice, ensureStripeTaxRate } =
    await import("@/lib/billing/providers/price-mapping.server");
  const { createStripeClient, stripePriceCheckoutBody } =
    await import("@/lib/billing/providers/stripe.server");
  const { createRazorpayClient, razorpaySubscriptionRequest } =
    await import("@/lib/billing/providers/razorpay.server");
  if (providerAddsTax(input.price.tax) && input.provider !== "stripe") {
    throw new Error(
      "Tax for this country must be included in the price before it can be paid this way.",
    );
  }
  const stripe = input.provider === "stripe" ? createStripeClient() : null;
  const razorpay = input.provider === "razorpay" ? createRazorpayClient() : null;
  const providerPriceId = await ensureProviderPrice(input.provider, {
    planPriceId: input.price.planPriceId,
    planName: input.price.planName,
    currency: input.price.currency,
    amountMinor: input.price.amountMinor,
    interval: input.price.interval,
  });
  const { data: inserted, error: insertError } = await input.supabase
    .from("billing_checkouts" as never)
    .insert({
      company_id: input.companyId,
      plan_code: input.price.planCode,
      billing_interval: input.price.interval,
      provider: input.provider,
      currency: input.price.currency,
      unit_amount_minor: input.price.amountMinor,
      plan_price_id: input.price.planPriceId,
      country_code: input.price.country,
      provider_price_id: providerPriceId,
      mode: (stripe ?? razorpay)!.mode,
      created_by: input.userId,
    } as never)
    .select("id" as never)
    .single();
  if (insertError) throw new Error(insertError.message);
  const checkoutId = (inserted as { id: string }).id;
  const trialEndUnix = trialEndUnixOrNull(input.trialEndsAt, new Date());
  let providerCouponId: string | null = null;
  if (input.offerCode) {
    const { data: reserved, error: reserveError } = await input.supabase.rpc(
      "billing_attach_coupon" as never,
      { _checkout_id: checkoutId, _code: input.offerCode } as never,
    );
    if (reserveError) throw new Error(reserveError.message);
    const coupon = reserved as CouponQuote;
    const { ensureProviderCoupon } = await import("@/lib/billing/providers/price-mapping.server");
    providerCouponId = await ensureProviderCoupon(input.provider, {
      code: coupon.code,
      kind: coupon.kind,
      percentBps: coupon.percentBps,
      amountMinor: coupon.amountMinor,
      currency: input.price.currency,
      durationType: coupon.durationType,
      durationMonths: coupon.durationMonths,
    });
  }
  let session: { id: string; url: string };
  if (stripe) {
    const secret = process.env["STRIPE_SECRET_KEY"] ?? "";
    const customerId = await createStripeCustomer(secret, input.billing);
    const created = await stripe.request(
      "POST",
      "checkout/sessions",
      stripePriceCheckoutBody({
        priceId: providerPriceId,
        checkoutId,
        companyId: input.companyId,
        planCode: input.price.planCode,
        successUrl: subscriptionSuccessUrl(input.origin),
        cancelUrl: `${input.origin}/settings?section=subscription&checkout=cancel`,
        customerId,
        email: input.billing.email || null,
        trialEndUnix,
        taxRateId:
          input.price.tax && providerAddsTax(input.price.tax)
            ? await ensureStripeTaxRate({
                ruleId: input.price.tax.ruleId,
                label: input.price.tax.label,
                rateBps: input.price.tax.rateBps,
                country: input.price.country,
              })
            : null,
        couponId: providerCouponId,
      }),
      `linkbooks-checkout-${checkoutId}`,
    );
    session = { id: String(created["id"] ?? ""), url: String(created["url"] ?? "") };
  } else {
    const created = await razorpay!.request(
      "POST",
      "subscriptions",
      razorpaySubscriptionRequest({
        planId: providerPriceId,
        interval: input.price.interval,
        checkoutId,
        companyId: input.companyId,
        planCode: input.price.planCode,
        startAtUnix: trialEndUnix,
        offerId: providerCouponId,
      }),
    );
    session = { id: String(created["id"] ?? ""), url: String(created["short_url"] ?? "") };
  }
  if (!session.id || !session.url)
    throw new Error("The payment provider did not start the checkout.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error: updateError } = await supabaseAdmin
    .from("billing_checkouts" as never)
    .update({ provider_session_id: session.id } as never)
    .eq("id" as never, checkoutId as never);
  if (updateError) throw new Error(updateError.message);
  return { url: session.url, provider: input.provider, checkoutId };
}

function requirePayMethod(value: string | undefined): PayMethodId {
  if (!isPayMethodId(value)) throw new Error("Choose a payment method.");
  return value;
}

async function loadSubscription(supabase: Client, companyId: string) {
  const { data, error } = await supabase
    .from("company_subscriptions" as never)
    .select("trial_ends_at, status, provider" as never)
    .eq("company_id" as never, companyId as never)
    .maybeSingle();
  if (error) return null;
  return data as { trial_ends_at: string | null; status: string; provider: string } | null;
}

async function priceSelection(
  supabase: Client,
  companyId: string,
  planCode: PlanCode,
  interval: BillingInterval,
  offerCode: string,
) {
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("country_code")
    .eq("id", companyId)
    .maybeSingle();
  if (companyError) throw new Error(companyError.message);
  if (!company) throw new Error("Company not found or you do not have access.");
  const region = resolveBillingRegion({
    organisationCountry: company.country_code,
    visitorCountry: visitorCountry(),
  });
  const currency = region.currency;
  const { data: plan, error: planError } = await supabase
    .from("billing_plans" as never)
    .select("*" as never)
    .eq("code" as never, planCode as never)
    .maybeSingle();
  if (planError) {
    if (missingTable(planError)) throw new Error(MIGRATION_MESSAGE);
    throw new Error(planError.message);
  }
  const row = plan as PlanRow | null;
  if (!row || !row.is_active) throw new Error("That plan is not available.");
  if (!hasLegacyPrice(row)) {
    return priceBookSelection(supabase, companyId, row, interval, offerCode);
  }
  const monthly = monthlyMinor(row, currency);
  if (monthly === null) {
    throw new Error(
      `${row.name} cannot be bought online yet. Your trial and existing records are not affected.`,
    );
  }
  const { data: settings, error: settingsError } = await supabase
    .from("billing_settings" as never)
    .select("trial_days, annual_free_months" as never)
    .eq("id" as never, true as never)
    .maybeSingle();
  if (settingsError) throw new Error(settingsError.message);
  const settingsRow = settings as { trial_days: number; annual_free_months: number } | null;
  const offer = offerCode ? await loadOffer(supabase, offerCode) : null;
  const quote = quotePrice({
    monthlyMinor: monthly,
    interval,
    annualFreeMonths: settingsRow?.annual_free_months ?? 2,
    currency,
    trialDays: row.trial_days ?? settingsRow?.trial_days ?? DEFAULT_TRIAL_DAYS,
    offer,
    now: new Date(),
    planCode,
  });
  return {
    quote,
    currency,
    country: region.country,
    planName: row.name,
    checkout: null as CheckoutPrice | null,
  };
}

type CheckoutPrice = {
  planPriceId: string;
  planCode: string;
  planName: string;
  interval: BillingInterval;
  currency: string;
  amountMinor: number;
  country: string;
  billingEnabled: boolean;
  providers: Array<"stripe" | "razorpay">;
  totalMinor?: number;
  tax?: CheckoutTax | null;
  coupon?: CouponQuote | null;
};

type CouponQuote = {
  code: string;
  kind: "percent" | "amount";
  percentBps: number;
  amountMinor: number;
  currency: string;
  discountMinor: number;
  durationType: "once" | "repeating" | "forever";
  durationMonths: number | null;
};

/** Country price-book plans: the published snapshot for the organisation country. */
async function priceBookSelection(
  supabase: Client,
  companyId: string,
  row: PlanRow,
  interval: BillingInterval,
  offerCode: string,
) {
  const { data, error } = offerCode
    ? await supabase.rpc(
        "billing_quote_coupon" as never,
        {
          _company_id: companyId,
          _plan_code: row.code,
          _interval: interval,
          _code: offerCode,
        } as never,
      )
    : await supabase.rpc(
        "billing_checkout_price" as never,
        { _company_id: companyId, _plan_code: row.code, _interval: interval } as never,
      );
  if (error) throw new Error(error.message);
  const checkout = data as CheckoutPrice;
  const coupon = checkout.coupon ?? null;
  if (!isBillingCurrency(checkout.currency)) {
    throw new Error(`Online payment in ${checkout.currency} is not available yet.`);
  }
  const amount = checkout.amountMinor;
  const total = checkout.totalMinor ?? amount;
  const quote: PriceQuote = {
    currency: checkout.currency,
    interval,
    listMinor: amount,
    discountMinor: coupon?.discountMinor ?? 0,
    dueMinor: total,
    recurringMinor: total,
    promoDurationMonths:
      coupon == null
        ? null
        : coupon.durationType === "repeating"
          ? (coupon.durationMonths ?? 1)
          : coupon.durationType === "once"
            ? 1
            : null,
    freeMonths: 0,
    trialDays: row.trial_days ?? DEFAULT_TRIAL_DAYS,
    offerCode: coupon?.code ?? null,
    ...(checkout.tax && checkout.tax.taxMinor > 0
      ? {
          taxMinor: checkout.tax.taxMinor,
          taxLabel: checkout.tax.label,
          taxIncluded: !providerAddsTax(checkout.tax),
        }
      : {}),
  };
  return {
    quote,
    currency: checkout.currency,
    country: checkout.country,
    planName: row.name,
    checkout,
  };
}

function requirePlanCode(value: string | undefined): PlanCode {
  if (!value || !isPlanCode(value)) throw new Error("Choose a plan.");
  return value;
}

async function createStripeIntroCoupon(
  secret: string,
  draft: Parameters<typeof stripeCheckoutBody>[0],
): Promise<string | null> {
  const months = draft.promoDurationMonths ?? 0;
  const discount = draft.discountMinor ?? 0;
  if (months < 1 || discount < 1) return null;
  const body = new URLSearchParams();
  body.set("duration", "repeating");
  body.set("duration_in_months", String(months));
  body.set("amount_off", String(discount));
  body.set("currency", draft.currency.toLowerCase());
  body.set("name", "StreakBooks intro offer");
  const response = await fetch("https://api.stripe.com/v1/coupons", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = (await response.json()) as { id?: string; error?: { message?: string } };
  if (!response.ok || !payload.id) {
    throw new Error(payload.error?.message ?? "Stripe could not create the intro coupon.");
  }
  return payload.id;
}

async function createStripeCustomer(
  secret: string,
  billing: CheckoutBilling | undefined,
): Promise<string | null> {
  if (!billing) return null;
  const body = new URLSearchParams();
  body.set("email", billing.email);
  body.set("name", billing.name);
  if (billing.company) body.set("metadata[company]", billing.company);
  body.set("address[line1]", billing.line1);
  if (billing.line2) body.set("address[line2]", billing.line2);
  body.set("address[city]", billing.city);
  if (billing.state) body.set("address[state]", billing.state);
  body.set("address[postal_code]", billing.postalCode);
  body.set("address[country]", billing.country);
  const response = await fetch("https://api.stripe.com/v1/customers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = (await response.json()) as { id?: string; error?: { message?: string } };
  if (!response.ok || !payload.id) {
    throw new Error(payload.error?.message ?? "Stripe could not save the billing address.");
  }
  return payload.id;
}

async function openStripeCheckout(draft: Parameters<typeof stripeCheckoutBody>[0]) {
  const secret = process.env["STRIPE_SECRET_KEY"];
  if (!secret) {
    throw new Error(
      "Card and bank checkout needs STRIPE_SECRET_KEY on the server. The free trial does not need a payment method.",
    );
  }
  assertStripeTestKey(secret);
  const customerId = await createStripeCustomer(secret, draft.billing);
  const body = stripeCheckoutBody(customerId ? { ...draft, customerId } : draft);
  const couponId = await createStripeIntroCoupon(secret, draft);
  if (couponId) body.set("discounts[0][coupon]", couponId);
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Idempotency-Key": `linkbooks-checkout-${draft.checkoutId}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = (await response.json()) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };
  if (!response.ok || !payload.url || !payload.id) {
    throw new Error(payload.error?.message ?? "Stripe could not start the checkout.");
  }
  return { id: payload.id, url: payload.url };
}

async function openRazorpayCheckout(draft: Parameters<typeof razorpayPlanBody>[0]) {
  const key = process.env["RAZORPAY_KEY_ID"];
  const secret = process.env["RAZORPAY_KEY_SECRET"];
  if (!key || !secret) {
    throw new Error(
      "UPI and NEFT need RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server. The free trial does not need a payment method.",
    );
  }
  assertRazorpayTestKey(key);
  const auth = `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
  const planResponse = await fetch("https://api.razorpay.com/v1/plans", {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(razorpayPlanBody(draft)),
  });
  const planPayload = (await planResponse.json()) as {
    id?: string;
    error?: { description?: string };
  };
  if (!planResponse.ok || !planPayload.id) {
    throw new Error(planPayload.error?.description ?? "Razorpay could not create the plan.");
  }
  const subResponse = await fetch("https://api.razorpay.com/v1/subscriptions", {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(razorpaySubscriptionBody(draft, planPayload.id)),
  });
  const subPayload = (await subResponse.json()) as {
    id?: string;
    short_url?: string;
    error?: { description?: string };
  };
  if (!subResponse.ok || !subPayload.id || !subPayload.short_url) {
    throw new Error(subPayload.error?.description ?? "Razorpay could not start the subscription.");
  }
  return { id: subPayload.id, url: subPayload.short_url };
}

export const saveBillingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      trialDays: number;
      trialPlanCode: string;
      annualFreeMonths: number;
      pastDueGraceDays: number;
    }) => {
      const trialDays = Math.round(Number(input?.trialDays));
      const annualFreeMonths = Math.round(Number(input?.annualFreeMonths));
      const pastDueGraceDays = Math.round(Number(input?.pastDueGraceDays));
      if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 365) {
        throw new Error("Trial length must be from 0 to 365 days.");
      }
      if (!Number.isInteger(annualFreeMonths) || annualFreeMonths < 0 || annualFreeMonths > 11) {
        throw new Error("Annual free months must be from 0 to 11.");
      }
      if (!Number.isInteger(pastDueGraceDays) || pastDueGraceDays < 0 || pastDueGraceDays > 60) {
        throw new Error("The payment grace period must be from 0 to 60 days.");
      }
      return {
        trialDays,
        trialPlanCode: requirePlanCode(input?.trialPlanCode),
        annualFreeMonths,
        pastDueGraceDays,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertOperator(supabase);
    const { error } = await supabase
      .from("billing_settings" as never)
      .update({
        trial_days: data.trialDays,
        trial_plan_code: data.trialPlanCode,
        annual_free_months: data.annualFreeMonths,
        past_due_grace_days: data.pastDueGraceDays,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id" as never, true as never);
    if (error) throw new Error(error.message);
    // Signup trials read the length from the trial plan, so keep it in step.
    const { error: trialError } = await supabase.rpc(
      "platform_set_plan_trial" as never,
      {
        _plan_code: data.trialPlanCode,
        _enabled: data.trialDays > 0,
        _days: data.trialDays > 0 ? data.trialDays : DEFAULT_TRIAL_DAYS,
        _reason: "Billing settings updated",
      } as never,
    );
    if (trialError && !missingTable(trialError)) throw new Error(trialError.message);
    return { ok: true as const };
  });

export const saveBillingPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      code: string;
      monthlyGbp: number;
      monthlyUsd: number;
      monthlyInr: number;
      users: number;
      invoicesPerMonth: number | null;
      billsPerMonth: number | null;
      multiCurrency: boolean;
      active: boolean;
    }) => ({
      code: requirePlanCode(input?.code),
      monthlyGbp: minor(input?.monthlyGbp, "GBP"),
      monthlyUsd: minor(input?.monthlyUsd, "USD"),
      monthlyInr: minor(input?.monthlyInr, "INR"),
      users: seats(input?.users),
      invoicesPerMonth: cap(input?.invoicesPerMonth),
      billsPerMonth: cap(input?.billsPerMonth),
      multiCurrency: Boolean(input?.multiCurrency),
      active: Boolean(input?.active),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertOperator(supabase);
    const { data: existing, error: existingError } = await supabase
      .from("billing_plans" as never)
      .select("*" as never)
      .eq("code" as never, data.code as never)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing && !hasLegacyPrice(existing as unknown as PlanRow)) {
      throw new Error(
        "This plan is priced from the price book. Change its limits as a new plan version instead.",
      );
    }
    assertPriceFloor("GBP", "month", data.monthlyGbp);
    assertPriceFloor("USD", "month", data.monthlyUsd);
    assertPriceFloor("INR", "month", data.monthlyInr);
    const { error } = await supabase
      .from("billing_plans" as never)
      .update({
        monthly_gbp: data.monthlyGbp,
        monthly_usd: data.monthlyUsd,
        monthly_inr: data.monthlyInr,
        users_included: data.users,
        invoices_per_month: data.invoicesPerMonth,
        bills_per_month: data.billsPerMonth,
        multi_currency: data.multiCurrency,
        is_active: data.active,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("code" as never, data.code as never);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const saveBillingOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: BillingOfferView) => normaliseOfferInput(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertOperator(supabase);
    const { error } = await supabase.from("billing_offers" as never).upsert(
      {
        code: data.code,
        name: data.name,
        kind: data.kind,
        percent_bps: data.percentBps,
        amount_minor: data.amountMinor,
        amount_currency: data.amountCurrency,
        extra_trial_days: data.extraTrialDays,
        extra_free_months: data.extraFreeMonths,
        intervals: data.intervals,
        plan_codes: data.planCodes.length > 0 ? data.planCodes : null,
        starts_on: data.startsOn,
        ends_on: data.endsOn,
        max_redemptions: data.maxRedemptions,
        is_active: data.active,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "code" } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const claimBillingOperator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(() => ({}))
  .handler(async () => {
    throw new Error("Platform access is granted by the platform owner, not from an organisation.");
  });

function minor(value: number, label: string): number {
  const amount = Math.round(Number(value));
  if (!Number.isInteger(amount) || amount < 0 || amount > 100_000_000) {
    throw new Error(`${label} price must be a whole number of minor units.`);
  }
  return amount;
}

function seats(value: number): number {
  const count = Math.round(Number(value));
  if (!Number.isInteger(count) || count < 1 || count > 1000)
    throw new Error("Included users must be from 1 to 1000.");
  return count;
}

function cap(value: number | null): number | null {
  if (value == null || value === ("" as unknown)) return null;
  const count = Math.round(Number(value));
  if (!Number.isInteger(count) || count < 0)
    throw new Error("A monthly document cap must be empty or zero or more.");
  return count;
}

function normaliseOfferInput(
  input: BillingOfferView,
): Omit<BillingOfferView, "redemptionCount"> & { redemptionCount: number } {
  const code = (input?.code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code)) {
    throw new Error("Promo codes use 2 to 40 letters, numbers, hyphens or underscores.");
  }
  const name = (input?.name ?? "").trim().slice(0, 80);
  if (!name) throw new Error("Give the offer a name.");
  const kind = input?.kind;
  if (
    kind !== "percent" &&
    kind !== "amount" &&
    kind !== "extra_trial_days" &&
    kind !== "extra_free_months"
  ) {
    throw new Error("Choose a percent, amount, extra trial or extra annual months offer.");
  }
  const percentBps = Math.round(Number(input?.percentBps ?? 0));
  const amountMinor = Math.round(Number(input?.amountMinor ?? 0));
  const extraTrialDays = Math.round(Number(input?.extraTrialDays ?? 0));
  const extraFreeMonths = Math.round(Number(input?.extraFreeMonths ?? 0));
  if (percentBps < 0 || percentBps > 10_000)
    throw new Error("Percent offers use 0 to 10000 basis points.");
  if (kind === "percent") assertDiscountCap(percentBps);
  if (amountMinor < 0) throw new Error("Amount offers cannot be negative.");
  if (extraTrialDays < 0 || extraTrialDays > 365)
    throw new Error("Extra trial days must be from 0 to 365.");
  if (extraFreeMonths < 0 || extraFreeMonths > 11)
    throw new Error("Extra free months must be from 0 to 11.");
  const intervals =
    input?.intervals === "month" || input?.intervals === "year" ? input.intervals : "any";
  const amountCurrency =
    input?.amountCurrency && isBillingCurrency(input.amountCurrency) ? input.amountCurrency : null;
  if (kind === "amount" && !amountCurrency) throw new Error("An amount offer needs a currency.");
  const planCodes = Array.isArray(input?.planCodes) ? input.planCodes.filter(isPlanCode) : [];
  return {
    code,
    name,
    kind,
    percentBps,
    amountMinor,
    amountCurrency,
    extraTrialDays,
    extraFreeMonths,
    intervals,
    planCodes,
    startsOn: dateOrNull(input?.startsOn),
    endsOn: dateOrNull(input?.endsOn),
    maxRedemptions:
      input?.maxRedemptions == null ? null : Math.max(0, Math.round(Number(input.maxRedemptions))),
    redemptionCount: 0,
    active: Boolean(input?.active),
  };
}

function dateOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Offer dates use YYYY-MM-DD.");
  return value;
}
