import { APP_CATEGORIES, type AppCategoryCode } from "@/lib/app-store/categories";
import type {
  ConnectorImplementationStatus,
  ConnectorKind,
} from "@/lib/app-store/connector-status";
import {
  DEFAULT_TRUST_FIELDS,
  parseTrustFields,
  type MarketplaceTrustFields,
} from "@/lib/app-store/trust";

/** Target countries for marketplace eligibility (PRD). */
export const MARKETPLACE_COUNTRIES = ["US", "UK", "AU", "NZ", "CA", "IN"] as const;
export type MarketplaceCountry = (typeof MARKETPLACE_COUNTRIES)[number];

export type MarketplacePricingModel =
  "free" | "freemium" | "subscription" | "usage" | "external_billed";

export type SyncCapability =
  | "one_way_import"
  | "one_way_export"
  | "bidirectional"
  | "manual"
  | "scheduled"
  | "webhook"
  | "historical_import"
  | "incremental";

export type LinkBooksModuleCapability =
  | "sales"
  | "purchases"
  | "banking"
  | "contacts"
  | "products"
  | "accounting"
  | "tax"
  | "expenses"
  | "payroll"
  | "inventory"
  | "files"
  | "reports";

export type MarketplaceAppDefinition = {
  code: string;
  name: string;
  headline: string;
  description: string;
  publisherName: string;
  publisherWebsite: string | null;
  kind: ConnectorKind;
  /** Priority for native roadmap work. Lower is higher priority. */
  nativePriority: number | null;
  implementationStatus: ConnectorImplementationStatus;
  /** Human-readable blocker when not e2e_verified. */
  blockerNotes: string | null;
  pricingModel: MarketplacePricingModel;
  categoryCodes: AppCategoryCode[];
  countries: MarketplaceCountry[];
  modules: LinkBooksModuleCapability[];
  syncCapabilities: SyncCapability[];
  authMethods: ("oauth2" | "api_key" | "partner_oauth" | "none")[];
  featured: boolean;
  recommended: boolean;
  recentlyAdded: boolean;
  sortOrder: number;
  documentationUrl: string | null;
  privacyPolicyUrl: string | null;
  supportUrl: string | null;
  /** Public API scopes a partner app may request when kind is partner_api. */
  requestedApiScopes: string[];
  /**
   * FAIL CLOSED. Must remain false until isolation and security controls are verified.
   * Never enable for real customer data without security_review_passed + e2e_verified.
   */
  realCustomerDataEnabled: boolean;
  securityReviewPassed: boolean;
} & MarketplaceTrustFields;

type MarketplaceAppSeed = Omit<
  MarketplaceAppDefinition,
  keyof MarketplaceTrustFields | "realCustomerDataEnabled" | "securityReviewPassed"
> &
  Partial<MarketplaceTrustFields> &
  Partial<Pick<MarketplaceAppDefinition, "realCustomerDataEnabled" | "securityReviewPassed">>;

/**
 * Seed catalogue. Database rows override when the marketplace migration is applied.
 * No entry claims e2e_verified — that requires verified live/sandbox synchronization.
 */
const MARKETPLACE_APP_SEED: readonly MarketplaceAppSeed[] = [
  {
    code: "shopify",
    name: "Shopify",
    headline: "Sync Shopify orders, refunds and payouts into LinkBooks.",
    description:
      "Native e-commerce connector for Shopify stores. Imports orders, customers, products, refunds, fees and settlement payouts into Sales, Products, Banking and Accounting — subject to Shopify API access and verified end-to-end synchronization.",
    publisherName: "LinkBooks",
    publisherWebsite: "https://linkbooks.app",
    kind: "native",
    nativePriority: 1,
    implementationStatus: "adapter_scaffolded",
    blockerNotes:
      "Native adapter scaffolded. Real Shopify Admin API OAuth credentials and E2E sync verification are required before Install is enabled for production use.",
    pricingModel: "free",
    categoryCodes: ["ecommerce", "payment_gateways", "inventory_warehousing"],
    countries: ["US", "UK", "AU", "NZ", "CA", "IN"],
    modules: ["sales", "products", "contacts", "banking", "accounting", "tax"],
    syncCapabilities: [
      "one_way_import",
      "webhook",
      "scheduled",
      "historical_import",
      "incremental",
    ],
    authMethods: ["oauth2"],
    featured: true,
    recommended: true,
    recentlyAdded: true,
    sortOrder: 10,
    documentationUrl: null,
    privacyPolicyUrl: null,
    supportUrl: null,
    requestedApiScopes: [],
  },
  {
    code: "amazon_seller",
    name: "Amazon Seller Central",
    headline: "Import Amazon marketplace sales and settlements.",
    description:
      "Native Amazon Selling Partner API connector for Seller Central. Targets order, fee, refund and settlement workflows into LinkBooks accounting — not complete until E2E sync is verified.",
    publisherName: "LinkBooks",
    publisherWebsite: "https://linkbooks.app",
    kind: "native",
    nativePriority: 2,
    implementationStatus: "credentials_blocked",
    blockerNotes:
      "Requires Amazon SP-API developer registration, app approval and regional marketplace credentials. No E2E sync has been verified.",
    pricingModel: "free",
    categoryCodes: ["ecommerce", "shipping_logistics"],
    countries: ["US", "UK", "AU", "CA", "IN"],
    modules: ["sales", "products", "banking", "accounting", "tax", "inventory"],
    syncCapabilities: ["one_way_import", "scheduled", "historical_import", "incremental"],
    authMethods: ["oauth2"],
    featured: true,
    recommended: true,
    recentlyAdded: true,
    sortOrder: 20,
    documentationUrl: null,
    privacyPolicyUrl: null,
    supportUrl: null,
    requestedApiScopes: [],
  },
  {
    code: "stripe_payments",
    name: "Stripe",
    headline: "Reconcile Stripe charges, fees, refunds and payouts.",
    description:
      "Native Stripe Connect/Payments connector for merchant charge and payout reconciliation into Banking and Accounting. Separate from LinkBooks SaaS billing Stripe usage. Not marked complete until E2E payout sync is verified.",
    publisherName: "LinkBooks",
    publisherWebsite: "https://linkbooks.app",
    kind: "native",
    nativePriority: 3,
    implementationStatus: "adapter_scaffolded",
    blockerNotes:
      "Distinct from LinkBooks platform billing. Merchant Stripe Connect OAuth and settlement posting must pass E2E verification before production Install.",
    pricingModel: "free",
    categoryCodes: ["payment_gateways", "subscriptions_billing"],
    countries: ["US", "UK", "AU", "NZ", "CA", "IN"],
    modules: ["sales", "banking", "accounting", "contacts"],
    syncCapabilities: ["one_way_import", "webhook", "scheduled", "incremental"],
    authMethods: ["oauth2"],
    featured: true,
    recommended: true,
    recentlyAdded: true,
    sortOrder: 30,
    documentationUrl: null,
    privacyPolicyUrl: null,
    supportUrl: null,
    requestedApiScopes: [],
  },
  {
    code: "woocommerce",
    name: "WooCommerce",
    headline: "Connect WooCommerce stores to LinkBooks sales and inventory.",
    description:
      "Native WooCommerce REST connector for order and product import. Requires store URL and API keys; E2E sync not yet verified.",
    publisherName: "LinkBooks",
    publisherWebsite: "https://linkbooks.app",
    kind: "native",
    nativePriority: 4,
    implementationStatus: "catalogue_only",
    blockerNotes: "Catalogue entry only. Adapter and E2E sync are not implemented.",
    pricingModel: "free",
    categoryCodes: ["ecommerce"],
    countries: ["US", "UK", "AU", "NZ", "CA", "IN"],
    modules: ["sales", "products", "contacts", "accounting", "tax"],
    syncCapabilities: ["one_way_import", "webhook", "scheduled"],
    authMethods: ["api_key"],
    featured: false,
    recommended: true,
    recentlyAdded: false,
    sortOrder: 40,
    documentationUrl: null,
    privacyPolicyUrl: null,
    supportUrl: null,
    requestedApiScopes: [],
  },
  {
    code: "paypal",
    name: "PayPal",
    headline: "Import PayPal transactions and payouts.",
    description:
      "Native PayPal REST connector for payment and payout reconciliation. Awaiting credentials and E2E verification.",
    publisherName: "LinkBooks",
    publisherWebsite: "https://linkbooks.app",
    kind: "native",
    nativePriority: 5,
    implementationStatus: "catalogue_only",
    blockerNotes: "Catalogue entry only. No live PayPal sync verified.",
    pricingModel: "free",
    categoryCodes: ["payment_gateways"],
    countries: ["US", "UK", "AU", "NZ", "CA", "IN"],
    modules: ["sales", "banking", "accounting"],
    syncCapabilities: ["one_way_import", "webhook", "scheduled"],
    authMethods: ["oauth2"],
    featured: false,
    recommended: false,
    recentlyAdded: false,
    sortOrder: 50,
    documentationUrl: null,
    privacyPolicyUrl: null,
    supportUrl: null,
    requestedApiScopes: [],
  },
  {
    code: "square",
    name: "Square",
    headline: "Sync Square POS and online payments.",
    description: "Native Square connector for payments and catalog. Not E2E verified.",
    publisherName: "LinkBooks",
    publisherWebsite: "https://linkbooks.app",
    kind: "native",
    nativePriority: 6,
    implementationStatus: "catalogue_only",
    blockerNotes: "Catalogue entry only. No Square E2E sync verified.",
    pricingModel: "free",
    categoryCodes: ["point_of_sale", "payment_gateways"],
    countries: ["US", "UK", "AU", "CA"],
    modules: ["sales", "products", "banking", "accounting"],
    syncCapabilities: ["one_way_import", "webhook", "scheduled"],
    authMethods: ["oauth2"],
    featured: false,
    recommended: false,
    recentlyAdded: false,
    sortOrder: 60,
    documentationUrl: null,
    privacyPolicyUrl: null,
    supportUrl: null,
    requestedApiScopes: [],
  },
  {
    code: "hubdoc",
    name: "Hubdoc",
    headline: "Partner document capture into LinkBooks purchases and files.",
    description:
      "Third-party document capture platform. Integration depends on Hubdoc API availability, commercial cooperation and technical approval. Partners connect through the LinkBooks public API and OAuth developer portal — not a fabricated sync.",
    publisherName: "Hubdoc (third party)",
    publisherWebsite: null,
    kind: "partner_api",
    nativePriority: null,
    implementationStatus: "credentials_blocked",
    blockerNotes:
      "Requires Hubdoc partnership, API access and a published partner application. Public API scopes and developer portal foundation ship first; E2E sync is not verified.",
    pricingModel: "external_billed",
    categoryCodes: ["document_capture", "ap_automation", "expense_management"],
    countries: ["US", "UK", "AU", "NZ", "CA"],
    modules: ["purchases", "expenses", "files", "accounting"],
    syncCapabilities: ["one_way_import", "webhook"],
    authMethods: ["partner_oauth"],
    featured: true,
    recommended: true,
    recentlyAdded: true,
    sortOrder: 70,
    documentationUrl: null,
    privacyPolicyUrl: null,
    supportUrl: null,
    requestedApiScopes: ["purchases.read", "purchases.write", "files.write", "contacts.read"],
  },
  {
    code: "link_my_books",
    name: "Link My Books",
    headline: "Partner e-commerce bookkeeping automation via the LinkBooks API.",
    description:
      "Third-party e-commerce accounting specialist. May integrate with LinkBooks when their API/product cooperation and technical approvals allow. Uses the LinkBooks public developer platform rather than a native connector until a partnership is confirmed.",
    publisherName: "Link My Books (third party)",
    publisherWebsite: null,
    kind: "partner_api",
    nativePriority: null,
    implementationStatus: "credentials_blocked",
    blockerNotes:
      "Subject to Link My Books API availability, cooperation and technical approvals. No E2E synchronization has been verified.",
    pricingModel: "external_billed",
    categoryCodes: ["ecommerce", "automation_workflows", "reporting_analytics"],
    countries: ["US", "UK", "AU", "NZ", "CA"],
    modules: ["sales", "banking", "accounting", "products", "tax"],
    syncCapabilities: ["bidirectional", "webhook", "scheduled"],
    authMethods: ["partner_oauth"],
    featured: true,
    recommended: true,
    recentlyAdded: true,
    sortOrder: 80,
    documentationUrl: null,
    privacyPolicyUrl: null,
    supportUrl: null,
    requestedApiScopes: [
      "sales.read",
      "sales.write",
      "banking.read",
      "accounting.read",
      "products.read",
      "products.write",
    ],
  },
  {
    code: "dext",
    name: "Dext",
    headline: "Partner receipt and bill capture (API cooperation required).",
    description:
      "Document capture partner listing. Integration requires Dext API access and approvals. Not E2E verified.",
    publisherName: "Dext (third party)",
    publisherWebsite: null,
    kind: "partner_api",
    nativePriority: null,
    implementationStatus: "catalogue_only",
    blockerNotes: "Partner listing only. No Dext connector or E2E sync verified.",
    pricingModel: "external_billed",
    categoryCodes: ["document_capture", "expense_management", "ap_automation"],
    countries: ["US", "UK", "AU", "NZ", "CA"],
    modules: ["purchases", "expenses", "files"],
    syncCapabilities: ["one_way_import", "webhook"],
    authMethods: ["partner_oauth"],
    featured: false,
    recommended: false,
    recentlyAdded: false,
    sortOrder: 90,
    documentationUrl: null,
    privacyPolicyUrl: null,
    supportUrl: null,
    requestedApiScopes: ["purchases.write", "files.write"],
  },
  {
    code: "hubspot",
    name: "HubSpot",
    headline: "CRM contacts and deals — partner or native adapter roadmap.",
    description:
      "CRM integration target. May ship as native OAuth or partner API depending on HubSpot app review. Not E2E verified.",
    publisherName: "LinkBooks",
    publisherWebsite: "https://linkbooks.app",
    kind: "hybrid",
    nativePriority: 20,
    implementationStatus: "catalogue_only",
    blockerNotes: "Catalogue entry only. No HubSpot E2E sync verified.",
    pricingModel: "free",
    categoryCodes: ["crm"],
    countries: ["US", "UK", "AU", "NZ", "CA", "IN"],
    modules: ["contacts", "sales"],
    syncCapabilities: ["bidirectional", "webhook", "scheduled"],
    authMethods: ["oauth2"],
    featured: false,
    recommended: false,
    recentlyAdded: false,
    sortOrder: 100,
    documentationUrl: null,
    privacyPolicyUrl: null,
    supportUrl: null,
    requestedApiScopes: [],
  },
];

function withTrustDefaults(app: MarketplaceAppSeed): MarketplaceAppDefinition {
  const nativeFirstParty = app.kind === "native" && app.publisherName === "LinkBooks";
  const defaultDisclosure = nativeFirstParty
    ? "LinkBooks first-party connector. External provider terms also apply. Not certified until formal reviews pass."
    : null;
  return {
    ...DEFAULT_TRUST_FIELDS,
    ...app,
    publisherVerified: app.publisherVerified ?? nativeFirstParty,
    certificationStatus: app.certificationStatus ?? "none",
    certificationTier: app.certificationTier ?? null,
    certificationExpiresAt: app.certificationExpiresAt ?? null,
    privacyDisclosure: app.privacyDisclosure ?? defaultDisclosure,
    suspended: app.suspended ?? false,
    apiVersion: app.apiVersion ?? "v1",
    minLinkbooksApi: app.minLinkbooksApi ?? null,
    deprecationAt: app.deprecationAt ?? null,
    breakingChangeNotes: app.breakingChangeNotes ?? null,
    // Fail closed for every seed listing — never auto-enable real customer data.
    realCustomerDataEnabled: app.realCustomerDataEnabled ?? false,
    securityReviewPassed: app.securityReviewPassed ?? false,
  };
}

export const DEFAULT_MARKETPLACE_APPS: readonly MarketplaceAppDefinition[] =
  MARKETPLACE_APP_SEED.map(withTrustDefaults);

export type MarketplaceCatalogueSource = "database" | "defaults";

export type MarketplaceAppListItem = MarketplaceAppDefinition & {
  installStatus: "not_installed" | "installed" | "disabled" | "error" | null;
  installId: string | null;
  connectionStatus?: string | null;
  connectionHealth?: string | null;
};

export function normalizeMarketplaceApps(raw: unknown): MarketplaceAppDefinition[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [...DEFAULT_MARKETPLACE_APPS];
  }
  const apps: MarketplaceAppDefinition[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const code = typeof r["code"] === "string" ? r["code"] : null;
    if (!code) continue;
    const fallback = DEFAULT_MARKETPLACE_APPS.find((a) => a.code === code);
    apps.push({
      code,
      name: stringOr(r["name"], fallback?.name ?? code),
      headline: stringOr(r["headline"], fallback?.headline ?? ""),
      description: stringOr(r["description"], fallback?.description ?? ""),
      publisherName: stringOr(
        r["publisherName"] ?? r["publisher_name"],
        fallback?.publisherName ?? "Unknown",
      ),
      publisherWebsite:
        nullableString(r["publisherWebsite"] ?? r["publisher_website"]) ??
        fallback?.publisherWebsite ??
        null,
      kind: (r["kind"] as ConnectorKind) ?? fallback?.kind ?? "native",
      nativePriority:
        typeof r["nativePriority"] === "number"
          ? r["nativePriority"]
          : typeof r["native_priority"] === "number"
            ? r["native_priority"]
            : (fallback?.nativePriority ?? null),
      implementationStatus:
        (r["implementationStatus"] as ConnectorImplementationStatus) ??
        (r["implementation_status"] as ConnectorImplementationStatus) ??
        fallback?.implementationStatus ??
        "catalogue_only",
      blockerNotes:
        nullableString(r["blockerNotes"] ?? r["blocker_notes"]) ?? fallback?.blockerNotes ?? null,
      pricingModel:
        (r["pricingModel"] as MarketplacePricingModel) ??
        (r["pricing_model"] as MarketplacePricingModel) ??
        fallback?.pricingModel ??
        "free",
      categoryCodes: arrayOfStrings(r["categoryCodes"] ?? r["category_codes"]) as AppCategoryCode[],
      countries: arrayOfStrings(r["countries"]) as MarketplaceCountry[],
      modules: arrayOfStrings(r["modules"]) as LinkBooksModuleCapability[],
      syncCapabilities: arrayOfStrings(
        r["syncCapabilities"] ?? r["sync_capabilities"],
      ) as SyncCapability[],
      authMethods: arrayOfStrings(
        r["authMethods"] ?? r["auth_methods"],
      ) as MarketplaceAppDefinition["authMethods"],
      featured: Boolean(r["featured"] ?? fallback?.featured ?? false),
      recommended: Boolean(r["recommended"] ?? fallback?.recommended ?? false),
      recentlyAdded: Boolean(
        r["recentlyAdded"] ?? r["recently_added"] ?? fallback?.recentlyAdded ?? false,
      ),
      sortOrder:
        typeof r["sortOrder"] === "number"
          ? r["sortOrder"]
          : typeof r["sort_order"] === "number"
            ? r["sort_order"]
            : (fallback?.sortOrder ?? 999),
      documentationUrl:
        nullableString(r["documentationUrl"] ?? r["documentation_url"]) ??
        fallback?.documentationUrl ??
        null,
      privacyPolicyUrl:
        nullableString(r["privacyPolicyUrl"] ?? r["privacy_policy_url"]) ??
        fallback?.privacyPolicyUrl ??
        null,
      supportUrl:
        nullableString(r["supportUrl"] ?? r["support_url"]) ?? fallback?.supportUrl ?? null,
      requestedApiScopes: arrayOfStrings(r["requestedApiScopes"] ?? r["requested_api_scopes"]),
      realCustomerDataEnabled: Boolean(
        r["realCustomerDataEnabled"] ?? r["real_customer_data_enabled"] ?? false,
      ),
      securityReviewPassed: Boolean(
        r["securityReviewPassed"] ?? r["security_review_passed"] ?? false,
      ),
      ...(() => {
        const trust = parseTrustFields(r);
        return {
          ...trust,
          publisherVerified: trust.publisherVerified || Boolean(fallback?.publisherVerified),
          privacyDisclosure: trust.privacyDisclosure ?? fallback?.privacyDisclosure ?? null,
        };
      })(),
    });
  }
  return apps.length > 0
    ? apps.sort((a, b) => a.sortOrder - b.sortOrder)
    : [...DEFAULT_MARKETPLACE_APPS];
}

export function filterMarketplaceApps(
  apps: readonly MarketplaceAppDefinition[],
  filters: {
    query?: string;
    category?: string | null;
    country?: string | null;
    pricing?: string | null;
    kind?: string | null;
    featured?: boolean;
    recommended?: boolean;
    recentlyAdded?: boolean;
  },
): MarketplaceAppDefinition[] {
  const q = filters.query?.trim().toLowerCase() ?? "";
  return apps.filter((app) => {
    if (filters.category && !app.categoryCodes.includes(filters.category as AppCategoryCode)) {
      return false;
    }
    if (filters.country && !app.countries.includes(filters.country as MarketplaceCountry)) {
      return false;
    }
    if (filters.pricing && app.pricingModel !== filters.pricing) return false;
    if (filters.kind && app.kind !== filters.kind) return false;
    if (filters.featured && !app.featured) return false;
    if (filters.recommended && !app.recommended) return false;
    if (filters.recentlyAdded && !app.recentlyAdded) return false;
    if (!q) return true;
    const hay = [
      app.name,
      app.headline,
      app.description,
      app.publisherName,
      ...app.categoryCodes,
      ...app.modules,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function marketplaceAppByCode(
  code: string,
  apps: readonly MarketplaceAppDefinition[] = DEFAULT_MARKETPLACE_APPS,
): MarketplaceAppDefinition | undefined {
  return apps.find((a) => a.code === code);
}

export function categoryCounts(
  apps: readonly MarketplaceAppDefinition[],
): { code: AppCategoryCode; name: string; count: number }[] {
  return APP_CATEGORIES.map((cat) => ({
    code: cat.code,
    name: cat.name,
    count: apps.filter((a) => a.categoryCodes.includes(cat.code)).length,
  })).filter((c) => c.count > 0);
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : null;
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}
