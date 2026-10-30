import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import {
  razorpayPlanBody,
  razorpaySubscriptionBody,
  stripeCheckoutBody,
  trialEndUnixOrNull,
} from "@/lib/billing/checkout-payload";
import {
  billingCurrencyForCompany,
  isBillingCurrency,
  isPlanCode,
  quotePrice,
  subscriptionAccess,
  type BillingCurrency,
  type BillingInterval,
  type OfferRule,
  type PlanCode,
} from "@/lib/billing/pricing";
import { assertRazorpayTestKey, assertStripeTestKey } from "@/lib/billing/provider-keys";

type Client = SupabaseClient<Database>;

export type BillingPlanView = {
  code: string;
  name: string;
  audience: string;
  summary: string;
  monthlyMinor: number;
  monthlyGbp: number;
  monthlyUsd: number;
  monthlyInr: number;
  users: number;
  invoicesPerMonth: number | null;
  billsPerMonth: number | null;
  multiCurrency: boolean;
  highlights: string[];
  active: boolean;
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
  providers: { stripe: boolean; razorpay: boolean };
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
};

function monthlyMinor(plan: PlanRow, currency: BillingCurrency): number {
  if (currency === "USD") return plan.monthly_usd;
  if (currency === "INR") return plan.monthly_inr;
  return plan.monthly_gbp;
}

function toPlanView(plan: PlanRow, currency: BillingCurrency): BillingPlanView {
  return {
    code: plan.code,
    name: plan.name,
    audience: plan.audience,
    summary: plan.summary,
    monthlyMinor: monthlyMinor(plan, currency),
    monthlyGbp: plan.monthly_gbp,
    monthlyUsd: plan.monthly_usd,
    monthlyInr: plan.monthly_inr,
    users: plan.users_included,
    invoicesPerMonth: plan.invoices_per_month,
    billsPerMonth: plan.bills_per_month,
    multiCurrency: plan.multi_currency,
    highlights: highlightsOf(plan.highlights),
    active: plan.is_active,
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
  trialDays: 30,
  trialPlanCode: "standard",
  annualFreeMonths: 2,
  pastDueGraceDays: 7,
};

export const getBillingOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: assertUuid(input?.companyId) }))
  .handler(async ({ data, context }): Promise<BillingOverview> => {
    const { supabase } = context;
    await assertCompanyMember(supabase, data.companyId);
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("name, is_demo, base_currency")
      .eq("id", data.companyId)
      .maybeSingle();
    if (companyError) throw new Error(companyError.message);
    if (!company) throw new Error("Company not found or you do not have access.");
    const currency = billingCurrencyForCompany(company.base_currency);

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
        isDemo: company.is_demo,
        currency,
        access: "full",
        subscription: null,
        usage: { invoicesThisMonth: 0, billsThisMonth: 0, users: 0 },
        plans: [],
        settings: EMPTY_SETTINGS,
        offers: [],
        providers: providerFlags(),
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
    const settings = settingsRow
      ? {
          trialDays: settingsRow.trial_days,
          trialPlanCode: settingsRow.trial_plan_code,
          annualFreeMonths: settingsRow.annual_free_months,
          pastDueGraceDays: settingsRow.past_due_grace_days,
        }
      : EMPTY_SETTINGS;
    const plans = ((plansRes.data ?? []) as unknown as PlanRow[]).map((plan) =>
      toPlanView(plan, currency),
    );
    const sub = subRes.data as {
      plan_code: string;
      status: string;
      billing_interval: string;
      trial_ends_at: string | null;
      current_period_end: string | null;
      provider: string;
      cancel_at_period_end: boolean;
      offer_code: string | null;
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
        ? "Demo organisations are complimentary. Billing does not change the ledger."
        : access === "read_only"
          ? "This trial or subscription has ended. Reports stay available. Choose a plan to post again."
          : null,
      companyName: company.name,
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
          }
        : null,
      usage,
      plans,
      settings,
      offers,
      providers: providerFlags(),
      isOperator,
    };
  });

function providerFlags(): { stripe: boolean; razorpay: boolean } {
  return {
    stripe: Boolean(process.env["STRIPE_SECRET_KEY"]),
    razorpay: Boolean(process.env["RAZORPAY_KEY_ID"] && process.env["RAZORPAY_KEY_SECRET"]),
  };
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
  .inputValidator(
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

export const startBillingTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; planCode: string }) => ({
    companyId: assertUuid(input?.companyId),
    planCode: requirePlanCode(input?.planCode),
  }))
  .handler(async ({ data, context }) => {
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
  });

export const createBillingCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      planCode: string;
      interval: string;
      provider: string;
      origin: string;
      offerCode?: string;
    }) => ({
      companyId: assertUuid(input?.companyId),
      planCode: requirePlanCode(input?.planCode),
      interval: assertInterval(input?.interval),
      provider:
        input?.provider === "razorpay"
          ? "razorpay"
          : input?.provider === "stripe"
            ? "stripe"
            : null,
      origin: assertOrigin(input?.origin ?? ""),
      offerCode: (input?.offerCode ?? "").trim().slice(0, 40),
    }),
  )
  .handler(async ({ data, context }) => {
    if (!data.provider) throw new Error("Choose Stripe or Razorpay.");
    const { supabase, userId } = context;
    await assertCompanyPermission(supabase, data.companyId, "billing.manage");
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("is_demo")
      .eq("id", data.companyId)
      .maybeSingle();
    if (companyError) throw new Error(companyError.message);
    if (company?.is_demo) throw new Error("Demo organisations are not billed.");
    const priced = await priceSelection(
      supabase,
      data.companyId,
      data.planCode,
      data.interval,
      data.offerCode,
    );
    if (priced.quote.recurringMinor < 1)
      throw new Error("The recurring price must be at least one minor unit.");

    const { data: inserted, error: insertError } = await supabase
      .from("billing_checkouts" as never)
      .insert({
        company_id: data.companyId,
        plan_code: data.planCode,
        billing_interval: data.interval,
        provider: data.provider,
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
    const sub = await loadSubscription(supabase, data.companyId);
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
      successUrl: `${data.origin}/settings?section=subscription&checkout=success`,
      cancelUrl: `${data.origin}/settings?section=subscription&checkout=cancel`,
      trialEndUnix: trialEndUnixOrNull(sub?.trial_ends_at ?? null, new Date()),
    };
    const session =
      data.provider === "stripe"
        ? await openStripeCheckout(draft)
        : await openRazorpayCheckout(draft);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: updateError } = await supabaseAdmin
      .from("billing_checkouts" as never)
      .update({ provider_session_id: session.id } as never)
      .eq("id" as never, checkoutId as never);
    if (updateError) throw new Error(updateError.message);
    return { url: session.url, provider: data.provider };
  });

async function loadSubscription(supabase: Client, companyId: string) {
  const { data, error } = await supabase
    .from("company_subscriptions" as never)
    .select("trial_ends_at, status" as never)
    .eq("company_id" as never, companyId as never)
    .maybeSingle();
  if (error) return null;
  return data as { trial_ends_at: string | null; status: string } | null;
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
    .select("base_currency")
    .eq("id", companyId)
    .maybeSingle();
  if (companyError) throw new Error(companyError.message);
  if (!company) throw new Error("Company not found or you do not have access.");
  const currency = billingCurrencyForCompany(company.base_currency);
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
  const { data: settings, error: settingsError } = await supabase
    .from("billing_settings" as never)
    .select("trial_days, annual_free_months" as never)
    .eq("id" as never, true as never)
    .maybeSingle();
  if (settingsError) throw new Error(settingsError.message);
  const settingsRow = settings as { trial_days: number; annual_free_months: number } | null;
  const offer = offerCode ? await loadOffer(supabase, offerCode) : null;
  const quote = quotePrice({
    monthlyMinor: monthlyMinor(row, currency),
    interval,
    annualFreeMonths: settingsRow?.annual_free_months ?? 2,
    currency,
    trialDays: settingsRow?.trial_days ?? 30,
    offer,
    now: new Date(),
    planCode,
  });
  return { quote, currency, planName: row.name };
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
  body.set("name", "LinkBooks intro offer");
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

async function openStripeCheckout(draft: Parameters<typeof stripeCheckoutBody>[0]) {
  const secret = process.env["STRIPE_SECRET_KEY"];
  if (!secret) {
    throw new Error(
      "Stripe is not configured. Add STRIPE_SECRET_KEY on the server. The free trial does not need a card.",
    );
  }
  assertStripeTestKey(secret);
  const body = stripeCheckoutBody(draft);
  const couponId = await createStripeIntroCoupon(secret, draft);
  if (couponId) body.set("discounts[0][coupon]", couponId);
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
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
      "Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server. The free trial does not need a card.",
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
  .inputValidator(
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
    return { ok: true as const };
  });

export const saveBillingPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
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
  .inputValidator((input: BillingOfferView) => normaliseOfferInput(input))
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
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("billing_operators" as never)
      .insert({ user_id: userId } as never);
    if (error) throw new Error(error.message);
    return { ok: true as const };
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
