import { z } from "zod";

/**
 * REST v1 contracts. The router validates every request against these schemas and the OpenAPI
 * document is generated from them, so the two cannot drift.
 */
export type ApiAuth = "public" | "user" | "platform" | "signature";
export type ApiScope = "billing:read" | "billing:analytics";

export type ApiRoute = {
  id: string;
  method: "GET" | "POST" | "PUT";
  path: string;
  tag: string;
  summary: string;
  auth: ApiAuth;
  scope?: ApiScope;
  idempotent?: boolean;
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?: z.ZodType;
  response: z.ZodType;
};

const uuid = z.guid();
const companyQuery = z.object({ companyId: uuid }).strict();
const planCode = z.enum(["standard", "pro", "business"]);
const interval = z.enum(["month", "year"]);
const isoDateTime = z.string().datetime({ offset: true });

const money = z.number().int().describe("Integer minor units");
const looseObject = (shape: z.ZodRawShape, description: string) =>
  z.looseObject(shape).describe(description);
const ok = z.object({ ok: z.literal(true) });
const page = (item: z.ZodType) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

const priceList = looseObject(
  { country: z.string(), currency: z.string().nullable() },
  "Published prices for the country; see the pricing page",
);
const quote = looseObject(
  { currency: z.string(), amountMinor: money, totalMinor: money },
  "Server-computed price with tax and any coupon",
);
const subscriptionState = looseObject(
  {
    status: z.string().nullable(),
    planCode: z.string().nullable(),
    access: z.enum(["full", "read_only"]),
    cancelAtPeriodEnd: z.boolean(),
    events: z.array(looseObject({ type: z.string(), occurredAt: z.string() }, "History event")),
  },
  "Current subscription, eligibility and history",
);
const documentSummary = looseObject(
  { id: uuid, number: z.string(), currency: z.string(), totalMinor: money },
  "Invoice or credit note summary",
);
const documentDetail = looseObject(
  {
    id: uuid,
    number: z.string(),
    currency: z.string(),
    subtotalMinor: money,
    taxMinor: money,
    totalMinor: money,
  },
  "Full invoice or credit note with seller, customer, lines and tax",
);
const pdfLink = z.object({ url: z.string().url().describe("Signed link, valid for 60 seconds") });
const checkoutBilling = z
  .object({
    email: z.string().email().optional(),
    firstName: z.string().max(100).optional(),
    lastName: z.string().max(100).optional(),
    company: z.string().max(200).optional(),
    line1: z.string().max(200).optional(),
    line2: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    postalCode: z.string().max(20).optional(),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
  })
  .strict();
const partnerPortal = looseObject(
  {
    program: looseObject({ open: z.boolean(), payoutsEnabled: z.boolean() }, "Programme state"),
    partners: z.array(looseObject({ id: uuid, name: z.string(), status: z.string() }, "Partner")),
  },
  "Partners you belong to, with codes, referrals, balances, ledger and payouts",
);
const adminRange = z
  .object({
    from: isoDateTime.optional(),
    to: isoDateTime.optional(),
    cursor: z.string().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();

export const API_ROUTES: ApiRoute[] = [
  {
    id: "priceList",
    method: "GET",
    path: "/api/v1/pricing/price-list",
    tag: "Pricing",
    summary: "Published plan prices for a country",
    auth: "public",
    query: z.object({ country: z.string().regex(/^[A-Z]{2}$/) }).strict(),
    response: priceList,
  },
  {
    id: "legalDocuments",
    method: "GET",
    path: "/api/v1/legal-documents",
    tag: "Pricing",
    summary: "Published legal documents",
    auth: "public",
    query: z
      .object({
        locale: z
          .string()
          .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
          .optional(),
      })
      .strict(),
    response: z.array(looseObject({ id: uuid, kind: z.string(), version: z.number() }, "Document")),
  },
  {
    id: "quote",
    method: "GET",
    path: "/api/v1/pricing/quote",
    tag: "Pricing",
    summary: "Price, tax and coupon for an organisation",
    auth: "user",
    query: z
      .object({
        companyId: uuid,
        planCode,
        interval,
        coupon: z.string().trim().min(3).max(40).optional(),
      })
      .strict(),
    response: quote,
  },
  {
    id: "subscriptionCurrent",
    method: "GET",
    path: "/api/v1/subscriptions/current",
    tag: "Subscriptions",
    summary: "Current subscription with history",
    auth: "user",
    query: companyQuery,
    response: subscriptionState,
  },
  {
    id: "subscriptionTrial",
    method: "POST",
    path: "/api/v1/subscriptions/trial",
    tag: "Subscriptions",
    summary: "Start the free trial",
    auth: "user",
    idempotent: true,
    body: z.object({ companyId: uuid, planCode }).strict(),
    response: z.object({ trialEndsAt: z.string() }),
  },
  {
    id: "subscriptionCheckout",
    method: "POST",
    path: "/api/v1/subscriptions/checkout",
    tag: "Subscriptions",
    summary: "Open a provider-hosted checkout",
    auth: "user",
    idempotent: true,
    body: z
      .object({
        companyId: uuid,
        planCode,
        interval,
        method: z.enum(["card", "upi", "emandate"]),
        origin: z.string().url().describe("Return origin; must be an allowed StreakBooks origin"),
        offerCode: z.string().trim().max(40).optional(),
        billing: checkoutBilling.optional(),
      })
      .strict(),
    response: z.object({ url: z.string().url(), provider: z.enum(["stripe", "razorpay"]) }),
  },
  {
    id: "subscriptionPlanChange",
    method: "POST",
    path: "/api/v1/subscriptions/plan-change",
    tag: "Subscriptions",
    summary: "Upgrade (after payment) or downgrade (at renewal)",
    auth: "user",
    idempotent: true,
    body: z.object({ companyId: uuid, planCode, interval: z.enum(["month", "year"]).optional() }).strict(),
    response: z.object({
      kind: z.enum(["upgrade", "downgrade"]),
      applies: z.enum(["after_payment", "period_end"]),
      effectiveAt: z.string().nullable(),
      targetPlanCode: z.string(),
      targetInterval: z.enum(["month", "year"]),
      paymentActionUrl: z.string().nullable(),
      amountDueMinor: z.number().int().nonnegative(),
      alreadyApplied: z.boolean(),
      chargedOnFile: z.boolean(),
    }),
  },
  {
    id: "subscriptionCancel",
    method: "POST",
    path: "/api/v1/subscriptions/cancel",
    tag: "Subscriptions",
    summary: "Cancel under the published cancellation policy",
    auth: "user",
    idempotent: true,
    body: z
      .object({
        companyId: uuid,
        confirm: z.literal(true),
        policyDocumentId: uuid.nullable(),
        reasonCode: z.string().max(40).nullable(),
        reasonText: z.string().trim().max(1000).nullable(),
      })
      .strict(),
    response: looseObject(
      { requestId: uuid, effectiveAt: z.string(), status: z.string() },
      "Cancellation",
    ),
  },
  {
    id: "subscriptionCancelReverse",
    method: "POST",
    path: "/api/v1/subscriptions/cancel/reverse",
    tag: "Subscriptions",
    summary: "Withdraw a scheduled cancellation",
    auth: "user",
    idempotent: true,
    body: companyQuery,
    response: ok,
  },
  {
    id: "billingAccount",
    method: "GET",
    path: "/api/v1/billing/account",
    tag: "Billing",
    summary: "Billing account for an organisation",
    auth: "user",
    query: companyQuery,
    response: looseObject({ id: uuid }, "Billing account"),
  },
  {
    id: "billingTaxId",
    method: "PUT",
    path: "/api/v1/billing/tax-id",
    tag: "Billing",
    summary: "Set or clear the customer tax ID",
    auth: "user",
    idempotent: true,
    body: z
      .object({
        accountId: uuid,
        scheme: z.enum(["GSTIN", "VAT", "GST", "ABN", "NZBN", "EIN", "OTHER"]),
        taxId: z.string().trim().max(40),
      })
      .strict(),
    response: ok,
  },
  {
    id: "invoiceList",
    method: "GET",
    path: "/api/v1/invoices",
    tag: "Invoices",
    summary: "Invoices and credit notes for an organisation",
    auth: "user",
    query: companyQuery,
    response: z.object({
      invoices: z.array(documentSummary),
      creditNotes: z.array(documentSummary),
    }),
  },
  {
    id: "invoiceGet",
    method: "GET",
    path: "/api/v1/invoices/{id}",
    tag: "Invoices",
    summary: "Invoice detail",
    auth: "user",
    params: z.object({ id: uuid }).strict(),
    response: documentDetail,
  },
  {
    id: "invoicePdf",
    method: "GET",
    path: "/api/v1/invoices/{id}/pdf",
    tag: "Invoices",
    summary: "Signed link to the invoice PDF",
    auth: "user",
    params: z.object({ id: uuid }).strict(),
    response: pdfLink,
  },
  {
    id: "creditNoteGet",
    method: "GET",
    path: "/api/v1/credit-notes/{id}",
    tag: "Invoices",
    summary: "Credit note detail",
    auth: "user",
    params: z.object({ id: uuid }).strict(),
    response: documentDetail,
  },
  {
    id: "creditNotePdf",
    method: "GET",
    path: "/api/v1/credit-notes/{id}/pdf",
    tag: "Invoices",
    summary: "Signed link to the credit note PDF",
    auth: "user",
    params: z.object({ id: uuid }).strict(),
    response: pdfLink,
  },
  {
    id: "referralStatus",
    method: "GET",
    path: "/api/v1/referrals",
    tag: "Partners",
    summary: "Referral programme state and current partner for an organisation",
    auth: "user",
    query: companyQuery,
    response: looseObject({ programOpen: z.boolean() }, "Referral status"),
  },
  {
    id: "referralRecord",
    method: "POST",
    path: "/api/v1/referrals",
    tag: "Partners",
    summary: "Link an organisation to a partner after accepting the disclosure",
    auth: "user",
    idempotent: true,
    body: z
      .object({
        companyId: uuid,
        code: z.string().trim().min(6).max(24),
        disclosureId: uuid,
        accepted: z.literal(true),
      })
      .strict(),
    response: z.object({
      result: z.enum(["attributed", "kept", "already_attributed"]),
      partnerName: z.string(),
    }),
  },
  {
    id: "partnerMe",
    method: "GET",
    path: "/api/v1/partners/me",
    tag: "Partners",
    summary: "Your partner memberships",
    auth: "user",
    response: partnerPortal,
  },
  {
    id: "partnerRegister",
    method: "POST",
    path: "/api/v1/partners/register",
    tag: "Partners",
    summary: "Apply for a firm to join the partner programme",
    auth: "user",
    idempotent: true,
    body: z
      .object({
        firmId: uuid,
        contactEmail: z.string().trim().email().max(200),
        countryCode: z.string().regex(/^[A-Z]{2}$/),
        membershipReference: z.string().trim().max(60),
        termsId: uuid,
        accepted: z.literal(true),
      })
      .strict(),
    response: looseObject({ id: uuid, status: z.string() }, "Partner"),
  },
  {
    id: "partnerCreateCode",
    method: "POST",
    path: "/api/v1/partners/{partnerId}/codes",
    tag: "Partners",
    summary: "Create a referral code",
    auth: "user",
    idempotent: true,
    params: z.object({ partnerId: uuid }).strict(),
    response: z.object({ id: uuid, code: z.string(), status: z.string() }),
  },
  {
    id: "webhookStripe",
    method: "POST",
    path: "/api/v1/webhooks/stripe",
    tag: "Webhooks",
    summary: "Stripe events (signature verified, stored, then processed)",
    auth: "signature",
    response: looseObject({}, "Acknowledgement"),
  },
  {
    id: "webhookRazorpay",
    method: "POST",
    path: "/api/v1/webhooks/razorpay",
    tag: "Webhooks",
    summary: "Razorpay events (signature verified, stored, then processed)",
    auth: "signature",
    response: looseObject({}, "Acknowledgement"),
  },
  {
    id: "adminInvoices",
    method: "GET",
    path: "/api/v1/admin/billing/invoices",
    tag: "Admin",
    summary: "Issued invoices, oldest first",
    auth: "platform",
    scope: "billing:read",
    query: adminRange,
    response: page(documentDetail),
  },
  {
    id: "adminPayments",
    method: "GET",
    path: "/api/v1/admin/billing/payments",
    tag: "Admin",
    summary: "Recorded provider payments, oldest first",
    auth: "platform",
    scope: "billing:read",
    query: adminRange,
    response: page(
      looseObject(
        { id: uuid, provider: z.string(), currency: z.string(), amountMinor: money },
        "Payment",
      ),
    ),
  },
  {
    id: "adminSubscriptions",
    method: "GET",
    path: "/api/v1/admin/billing/subscriptions",
    tag: "Admin",
    summary: "Organisation subscriptions",
    auth: "platform",
    scope: "billing:read",
    query: z
      .object({
        cursor: uuid.optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      })
      .strict(),
    response: page(looseObject({ companyId: uuid, status: z.string() }, "Subscription")),
  },
  {
    id: "adminAnalytics",
    method: "GET",
    path: "/api/v1/admin/billing/analytics",
    tag: "Admin",
    summary: "Billing analytics per currency (MRR, revenue, lifecycle, partners, webhooks)",
    auth: "platform",
    scope: "billing:analytics",
    query: z.object({ from: isoDateTime.optional(), to: isoDateTime.optional() }).strict(),
    response: looseObject(
      {
        range: z.object({ from: z.string(), to: z.string() }),
        mrr: z.array(looseObject({ currency: z.string(), mrrMinor: money }, "MRR")),
      },
      "Analytics snapshot; ranges are limited to one year",
    ),
  },
];

export function matchRoute(
  method: string,
  pathname: string,
): { route: ApiRoute; params: Record<string, string> } | { allowed: string[] } | null {
  const allowed: string[] = [];
  for (const route of API_ROUTES) {
    const names: string[] = [];
    const pattern = new RegExp(
      `^${route.path.replace(/\{(\w+)\}/g, (_, name: string) => {
        names.push(name);
        return "([^/]+)";
      })}$`,
    );
    const match = pattern.exec(pathname);
    if (!match) continue;
    if (route.method !== method) {
      allowed.push(route.method);
      continue;
    }
    const params: Record<string, string> = {};
    names.forEach((name, index) => {
      params[name] = decodeURIComponent(match[index + 1] ?? "");
    });
    return { route, params };
  }
  return allowed.length ? { allowed } : null;
}
