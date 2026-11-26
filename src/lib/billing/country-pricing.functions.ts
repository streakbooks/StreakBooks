import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  countryRuleInput,
  draftCountryPricesInput,
  exchangeRateInput,
  priceInputInput,
  priceListInput,
  type CountryPricingAdmin,
} from "@/lib/billing/country-pricing";
import type { PriceList } from "@/lib/billing/domain/country-pricing";

/**
 * Country pricing. The public price list is read with the publishable key and only ever returns
 * published versions. Admin calls run as the signed-in user; the database functions require an
 * aal2 platform session, validate everything again and audit each change.
 */
type RpcClient = {
  rpc: (
    fn: never,
    args?: never,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
};

async function callRpc(client: unknown, fn: string, args?: Record<string, unknown>) {
  const { data, error } = await (client as RpcClient).rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data;
}

function countryFrom(value: string | null | undefined): string | null {
  const code = (value ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

export const getPublicPriceList = createServerFn({ method: "GET" })
  .validator((input: unknown) => priceListInput.parse(input))
  .handler(async ({ data }) => {
    // Region is request-specific: never cache one visitor's prices for another.
    setResponseHeader("Cache-Control", "private, no-store");
    const selected = countryFrom(data?.country);
    const visitor = countryFrom(getRequestHeader("x-vercel-ip-country"));
    const country = selected ?? visitor;
    const source = selected ? "selected" : visitor ? "visitor" : "fallback";
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) return { ready: false as const, list: null, country, source };
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: list, error } = await client.rpc(
      "billing_price_list" as never,
      {
        _country: country,
      } as never,
    );
    if (error) {
      if (error.code === "42883" || error.code === "PGRST202") {
        return { ready: false as const, list: null, country, source };
      }
      throw new Error(error.message);
    }
    return { ready: true as const, list: list as PriceList, country, source };
  });

export const getCountryPricingAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }) =>
      (await callRpc(context.supabase, "platform_country_pricing")) as CountryPricingAdmin,
  );

export const saveCountryPricingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => countryRuleInput.parse(input))
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "platform_set_country_pricing_rule", {
      _country: data.country,
      _strategy: data.strategy,
      _currency: data.currency,
      _markup_bps: data.markupBps,
      _rounding_mode: data.roundingMode,
      _max_rate_age_hours: data.maxRateAgeHours,
      _active: data.active,
      _reason: data.reason,
    });
    return { ok: true as const };
  });

export const savePriceInput = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => priceInputInput.parse(input))
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "platform_set_price_input", {
      _plan_code: data.planCode,
      _interval: data.interval,
      _country: data.country,
      _currency: data.currency,
      _amount_minor: data.amountMinor,
      _reason: data.reason,
    });
    return { ok: true as const };
  });

export const recordExchangeRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => exchangeRateInput.parse(input))
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "platform_record_exchange_rate", {
      _quote_currency: data.quoteCurrency,
      _rate: data.rate,
      _effective_at: data.effectiveAt,
      _reason: data.reason,
    });
    return { ok: true as const };
  });

export const draftCountryPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => draftCountryPricesInput.parse(input))
  .handler(
    async ({ data, context }) =>
      (await callRpc(context.supabase, "platform_draft_country_prices", {
        _plan_code: data.planCode,
        _reason: data.reason,
      })) as { versionId: string; status: string; prices: number },
  );
