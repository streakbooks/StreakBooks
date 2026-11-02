import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { BILLING_CURRENCIES, isBillingCurrency, type BillingCurrency } from "@/lib/billing/pricing";
import { resolveBillingRegion } from "@/lib/billing/region";
import { FEATURE_DEPENDENCIES } from "@/lib/platform/feature-registry";
import type { FeaturePrice, PriceTier } from "@/lib/platform/price-book";
import { buildPlanQuote, type PlanBuilderQuote } from "./plan-quote";

const selectionSchema = z.object({
  planCode: z.string().trim().min(1).max(40).nullable().default(null),
  currency: z.enum(BILLING_CURRENCIES).nullable().default(null),
  selections: z
    .array(
      z.object({
        featureKey: z.string().trim().min(2).max(64),
        quantity: z.number().int().min(0).max(100_000),
      }),
    )
    .max(40)
    .default([]),
});

type PublicPlan = {
  code: string;
  name: string;
  audience: string;
  summary: string;
  badge: string | null;
  prices:
    { currency: string; interval: string; amountMinor: number; needsReview: boolean }[] | null;
};

function missingRpc(error: { code?: string; message: string }): boolean {
  return error.code === "42883" || error.code === "PGRST202" || error.code === "42P01";
}

function asTiers(value: unknown, featureKey: string): PriceTier[] {
  if (!Array.isArray(value)) throw new Error(`Price tiers for ${featureKey} are not a list.`);
  return value.map((tier) => {
    if (tier == null || typeof tier !== "object")
      throw new Error(`A price tier for ${featureKey} is invalid.`);
    const row = tier as { upTo?: unknown; amountMinor?: unknown };
    const upTo = row.upTo == null ? null : row.upTo;
    if (upTo != null && (typeof upTo !== "number" || !Number.isInteger(upTo))) {
      throw new Error(`A price tier for ${featureKey} has an invalid upper bound.`);
    }
    if (typeof row.amountMinor !== "number" || !Number.isInteger(row.amountMinor)) {
      throw new Error(`A price tier for ${featureKey} has an invalid amount.`);
    }
    return { upTo, amountMinor: row.amountMinor };
  });
}

function asPrices(data: unknown): FeaturePrice[] {
  if (!Array.isArray(data)) return [];
  return data.map((row) => {
    const price = row as Record<string, unknown>;
    const featureKey = String(price["featureKey"] ?? "");
    const currency = String(price["currency"] ?? "");
    if (!isBillingCurrency(currency)) throw new Error(`Unsupported currency on ${featureKey}.`);
    const interval =
      price["interval"] === "year" ? "year" : price["interval"] === "month" ? "month" : null;
    if (!interval) throw new Error(`Unsupported interval on ${featureKey}.`);
    return {
      featureKey,
      model: price["model"] as FeaturePrice["model"],
      amountMinor: Number(price["amountMinor"]),
      currency,
      interval,
      minQty: Number(price["minQty"] ?? 0),
      maxQty: price["maxQty"] == null ? null : Number(price["maxQty"]),
      includedQty: Number(price["includedQty"] ?? 0),
      tiers: asTiers(price["tiers"], featureKey),
      taxBps: Number(price["taxBps"] ?? 0),
    };
  });
}

function planAmount(
  plan: PublicPlan,
  currency: BillingCurrency,
  interval: "month" | "year",
): number | null {
  const row = plan.prices?.find(
    (price) => price.currency === currency && price.interval === interval,
  );
  return row && Number.isInteger(row.amountMinor) ? row.amountMinor : null;
}

export const quoteCustomerPlan = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => selectionSchema.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const region = resolveBillingRegion({
      visitorCountry: getRequestHeader("x-vercel-ip-country"),
    });
    const currency = data.currency ?? region.currency;
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) {
      return {
        plansReady: false,
        addonsReady: false,
        currency,
        country: region.country,
        source: region.source,
        plans: [] as PublicPlan[],
        quote: null as PlanBuilderQuote | null,
        message: "Published prices are unavailable in this environment.",
      };
    }
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const plansResult = await client.rpc("list_public_billing_plans" as never);
    const pricesResult = await client.rpc("list_live_feature_prices" as never);
    if (plansResult.error && !missingRpc(plansResult.error))
      throw new Error(plansResult.error.message);
    if (pricesResult.error && !missingRpc(pricesResult.error))
      throw new Error(pricesResult.error.message);
    const plans = (Array.isArray(plansResult.data) ? plansResult.data : []) as PublicPlan[];
    const plansReady = !plansResult.error;
    const addonsReady = !pricesResult.error;
    const plan = plans.find((row) => row.code === data.planCode) ?? null;
    let quote: PlanBuilderQuote | null = null;
    let message: string | null = null;
    if (!plansReady)
      message = "Published plan prices appear after the billing migration is applied.";
    else if (data.planCode && !plan) message = "That plan is not published.";
    else if (plan && !addonsReady && data.selections.length > 0) {
      message =
        "Add-on prices appear after the entitlement migration is applied. Selected features were not priced, and no charge was created.";
    } else if (plan) {
      quote = buildPlanQuote({
        planCode: plan.code,
        currency,
        planMonthlyMinor: planAmount(plan, currency, "month"),
        planYearlyMinor: planAmount(plan, currency, "year"),
        prices: addonsReady
          ? asPrices(pricesResult.data).filter((price) => price.currency === currency)
          : [],
        selections: data.selections,
        dependencies: FEATURE_DEPENDENCIES,
      });
      if (!addonsReady) {
        message =
          "Add-on prices appear after the entitlement migration is applied. The total below is the published base plan only. No charge was created.";
      }
    }
    return {
      plansReady,
      addonsReady,
      currency,
      country: region.country,
      source: region.source,
      plans,
      quote,
      message,
    };
  });
