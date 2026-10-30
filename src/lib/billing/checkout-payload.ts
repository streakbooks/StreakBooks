import { countries } from "@/lib/company-constants";
import type { BillingCurrency, BillingInterval } from "@/lib/billing/pricing";

/** Presentment currency for a payer's country. Countries without a local price use USD. */
export function checkoutCurrencyForCountry(country: string): BillingCurrency {
  const code = country.trim().toUpperCase();
  if (code === "IN") return "INR";
  if (code === "GB") return "GBP";
  if (code === "AU") return "AUD";
  if (code === "NZ") return "NZD";
  return "USD";
}

/** Region from a locale tag, when it is one of the launch countries. */
export function billingCountryFromLocale(locale: string | undefined): string {
  const region = locale?.split("-").pop()?.toUpperCase() ?? "";
  if (region.length !== 2) return "";
  return countries.some((item) => item.code === region) ? region : "";
}

export type CheckoutBilling = {
  email: string;
  name: string;
  company: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type CheckoutBillingInput = {
  email?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export type PayMethodId = "card" | "upi" | "neft" | "ach" | "bacs" | "becs" | "nz_bank";

export type PayMethodChoice = {
  id: PayMethodId;
  title: string;
  detail: string;
  provider: "stripe" | "razorpay";
  /** Empty when Razorpay hosts the method. */
  stripeTypes: string[];
  available: boolean;
  reason: string | null;
};

const PAY_METHODS: {
  id: PayMethodId;
  title: string;
  detail: string;
  provider: "stripe" | "razorpay";
  stripeTypes: string[];
  currency: BillingCurrency | null;
  unavailable: string;
}[] = [
  {
    id: "card",
    title: "Credit or debit card",
    detail:
      "Visa, Mastercard, American Express and other cards. Apple Pay and Google Pay appear on the secure page when the device supports them.",
    provider: "stripe",
    stripeTypes: ["card"],
    currency: null,
    unavailable: "",
  },
  {
    id: "upi",
    title: "UPI",
    detail: "Google Pay, PhonePe, Paytm and other UPI apps. A card is not required.",
    provider: "razorpay",
    stripeTypes: [],
    currency: "INR",
    unavailable: "Available when the billing country is India.",
  },
  {
    id: "neft",
    title: "Netbanking and NEFT",
    detail:
      "Indian bank transfer, including NEFT, RTGS, IMPS and netbanking. A card is not required.",
    provider: "razorpay",
    stripeTypes: [],
    currency: "INR",
    unavailable: "Available when the billing country is India.",
  },
  {
    id: "ach",
    title: "US bank account",
    detail: "ACH debit from a US bank account. A card is not required.",
    provider: "stripe",
    stripeTypes: ["us_bank_account"],
    currency: "USD",
    unavailable: "Available when the billing country is the United States or Canada.",
  },
  {
    id: "bacs",
    title: "UK bank account",
    detail: "Bacs Direct Debit from a UK bank account. A card is not required.",
    provider: "stripe",
    stripeTypes: ["bacs_debit"],
    currency: "GBP",
    unavailable: "Available when the billing country is the United Kingdom.",
  },
  {
    id: "becs",
    title: "Australian bank account",
    detail: "BECS Direct Debit from an Australian bank account. A card is not required.",
    provider: "stripe",
    stripeTypes: ["au_becs_debit"],
    currency: "AUD",
    unavailable: "Available when the billing country is Australia.",
  },
  {
    id: "nz_bank",
    title: "New Zealand bank account",
    detail: "Direct debit from a New Zealand bank account. A card is not required.",
    provider: "stripe",
    stripeTypes: ["nz_bank_account"],
    currency: "NZD",
    unavailable: "Available when the billing country is New Zealand.",
  },
];

export function isPayMethodId(value: string | undefined): value is PayMethodId {
  return PAY_METHODS.some((method) => method.id === value);
}

/** Methods a subscription can renew with. Card works in every billing currency. */
export function paymentMethodsFor(currency: BillingCurrency): PayMethodChoice[] {
  return PAY_METHODS.map((method) => {
    const available = method.currency == null || method.currency === currency;
    return {
      id: method.id,
      title: method.title,
      detail: method.detail,
      provider: method.provider,
      stripeTypes: method.stripeTypes,
      available,
      reason: available ? null : method.unavailable,
    };
  });
}

export function parseCheckoutBilling(input: CheckoutBillingInput | undefined): CheckoutBilling {
  const email = (input?.email ?? "").trim().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a billing email.");
  const firstName = (input?.firstName ?? "").trim().slice(0, 60);
  const lastName = (input?.lastName ?? "").trim().slice(0, 60);
  if (firstName.length < 1 || lastName.length < 1) throw new Error("Enter the billing name.");
  const line1 = (input?.line1 ?? "").trim().slice(0, 120);
  if (line1.length < 3) throw new Error("Enter the billing address.");
  const city = (input?.city ?? "").trim().slice(0, 80);
  if (city.length < 2) throw new Error("Enter the billing city.");
  const postalCode = (input?.postalCode ?? "").trim().slice(0, 20);
  if (postalCode.length < 2) throw new Error("Enter the postal code.");
  const country = (input?.country ?? "").trim().toUpperCase();
  if (!countries.some((item) => item.code === country))
    throw new Error("Choose a billing country.");
  return {
    email,
    name: `${firstName} ${lastName}`,
    company: (input?.company ?? "").trim().slice(0, 120),
    line1,
    line2: (input?.line2 ?? "").trim().slice(0, 120),
    city,
    state: (input?.state ?? "").trim().slice(0, 80),
    postalCode,
    country,
  };
}

export type CheckoutDraft = {
  checkoutId: string;
  companyId: string;
  planCode: string;
  planName: string;
  interval: BillingInterval;
  currency: BillingCurrency;
  unitAmountMinor: number;
  discountMinor?: number;
  promoDurationMonths?: number | null;
  successUrl: string;
  cancelUrl: string;
  /** Unix seconds. Omit when the remaining trial is under 48 hours. */
  trialEndUnix: number | null;
  billing?: CheckoutBilling;
  customerId?: string;
  paymentMethodTypes?: string[];
  payMethod?: string;
};

export function stripeCheckoutBody(draft: CheckoutDraft): URLSearchParams {
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("success_url", draft.successUrl);
  body.set("cancel_url", draft.cancelUrl);
  body.set("client_reference_id", draft.checkoutId);
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", draft.currency.toLowerCase());
  body.set("line_items[0][price_data][unit_amount]", String(draft.unitAmountMinor));
  body.set(
    "line_items[0][price_data][recurring][interval]",
    draft.interval === "year" ? "year" : "month",
  );
  body.set("line_items[0][price_data][product_data][name]", `LinkBooks ${draft.planName}`);
  body.set("metadata[checkout_id]", draft.checkoutId);
  body.set("metadata[company_id]", draft.companyId);
  body.set("metadata[plan_code]", draft.planCode);
  body.set("metadata[currency]", draft.currency);
  body.set("metadata[billing_interval]", draft.interval);
  body.set("metadata[unit_amount]", String(draft.unitAmountMinor));
  if (draft.payMethod) body.set("metadata[pay_method]", draft.payMethod);
  draft.paymentMethodTypes?.forEach((type, index) => {
    body.set(`payment_method_types[${index}]`, type);
  });
  if (draft.customerId) {
    body.set("customer", draft.customerId);
    body.set("customer_update[name]", "auto");
    body.set("customer_update[address]", "auto");
    body.set("billing_address_collection", "auto");
  } else if (draft.billing?.email) {
    body.set("customer_email", draft.billing.email);
    body.set("billing_address_collection", "required");
  }
  body.set("subscription_data[metadata][checkout_id]", draft.checkoutId);
  body.set("subscription_data[metadata][company_id]", draft.companyId);
  body.set("subscription_data[metadata][plan_code]", draft.planCode);
  body.set("subscription_data[metadata][currency]", draft.currency);
  body.set("subscription_data[metadata][billing_interval]", draft.interval);
  body.set("subscription_data[metadata][unit_amount]", String(draft.unitAmountMinor));
  if (draft.trialEndUnix != null) {
    body.set("subscription_data[trial_end]", String(draft.trialEndUnix));
  }
  return body;
}

export function razorpayPlanBody(draft: CheckoutDraft): Record<string, unknown> {
  return {
    period: draft.interval === "year" ? "yearly" : "monthly",
    interval: 1,
    item: {
      name: `LinkBooks ${draft.planName}`,
      amount: draft.unitAmountMinor,
      currency: draft.currency,
    },
    notes: {
      checkout_id: draft.checkoutId,
      company_id: draft.companyId,
      plan_code: draft.planCode,
      currency: draft.currency,
      billing_interval: draft.interval,
      unit_amount: String(draft.unitAmountMinor),
      pay_method: draft.payMethod ?? "",
    },
  };
}

export function razorpaySubscriptionBody(
  draft: CheckoutDraft,
  planId: string,
): Record<string, unknown> {
  return {
    plan_id: planId,
    total_count: draft.interval === "year" ? 5 : 60,
    customer_notify: 1,
    notes: {
      checkout_id: draft.checkoutId,
      company_id: draft.companyId,
      plan_code: draft.planCode,
      currency: draft.currency,
      billing_interval: draft.interval,
      unit_amount: String(draft.unitAmountMinor),
      pay_method: draft.payMethod ?? "",
    },
    ...(draft.trialEndUnix != null ? { start_at: draft.trialEndUnix } : {}),
  };
}

/** Stripe rejects a trial_end less than 48 hours ahead. */
export function trialEndUnixOrNull(trialEndsAt: string | null, now: Date): number | null {
  if (!trialEndsAt) return null;
  const end = Date.parse(trialEndsAt);
  if (!Number.isFinite(end)) return null;
  const minimum = now.getTime() + 48 * 60 * 60 * 1000;
  if (end < minimum) return null;
  return Math.floor(end / 1000);
}
