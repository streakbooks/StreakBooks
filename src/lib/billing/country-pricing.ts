import { z } from "zod";
import {
  ROUNDING_MODES,
  PRICING_STRATEGIES,
  isValidRate,
} from "@/lib/billing/domain/country-pricing";

const countryCode = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{2}$/, "Choose a country"));
const currencyCode = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, "Choose a currency"));
const reason = z.string().trim().min(3, "Record a reason").max(500);
const planCode = z.string().regex(/^[a-z_]{2,40}$/, "Choose a plan");

export const priceListInput = z
  .object({ country: z.string().trim().max(2).optional() })
  .strict()
  .optional();

export const countryRuleInput = z
  .object({
    country: countryCode,
    strategy: z.enum(PRICING_STRATEGIES),
    currency: currencyCode,
    markupBps: z.number().int().min(0).max(10000),
    roundingMode: z.enum(ROUNDING_MODES as [string, ...string[]]),
    maxRateAgeHours: z.number().int().min(1).max(8760).nullable(),
    active: z.boolean(),
    reason,
  })
  .strict();

export const priceInputInput = z
  .object({
    planCode,
    interval: z.enum(["month", "year"]),
    country: countryCode.nullable(),
    currency: currencyCode,
    amountMinor: z.number().int().min(1).max(2147483647).nullable(),
    reason,
  })
  .strict();

export const exchangeRateInput = z
  .object({
    quoteCurrency: currencyCode,
    rate: z.string().trim().refine(isValidRate, "Enter a positive rate with up to 12 decimals"),
    effectiveAt: z.string().datetime({ offset: true }).nullable(),
    reason,
  })
  .strict();

export const draftCountryPricesInput = z.object({ planCode, reason }).strict();

export type CountryPricingRule = {
  country: string;
  strategy: (typeof PRICING_STRATEGIES)[number];
  currency: string;
  markupBps: number;
  roundingMode: string;
  maxRateAgeHours: number | null;
  active: boolean;
  updatedAt: string;
};

export type PriceInputRow = {
  planCode: string;
  interval: "month" | "year";
  country: string | null;
  currency: string;
  amountMinor: number;
  updatedAt: string;
};

export type ExchangeRateRow = {
  id: string;
  quote: string;
  rate: string;
  source: string;
  effectiveAt: string;
  fetchedAt: string;
};

export type CountryPricingAdmin = {
  baseCurrency: string;
  rules: CountryPricingRule[];
  inputs: PriceInputRow[];
  rates: ExchangeRateRow[];
  currencies: { code: string; name: string; minorUnits: number }[];
};
