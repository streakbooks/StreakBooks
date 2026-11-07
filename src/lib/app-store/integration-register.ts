/**
 * Complete integration register — mandatory status vocabulary.
 * Completed (Available) requires independently verified E2E sync.
 * Never invent partnerships or claim universal compatibility.
 */

import { DEFAULT_MARKETPLACE_APPS } from "@/lib/app-store/catalogue";
import type { ConnectorImplementationStatus } from "@/lib/app-store/connector-status";

export const INTEGRATION_REGISTER_STATUSES = [
  "Research",
  "Provider Approval Required",
  "Planned",
  "In Development",
  "Testing",
  "Available",
  "Unsupported",
] as const;

export type IntegrationRegisterStatus = (typeof INTEGRATION_REGISTER_STATUSES)[number];

export type IntegrationCategoryGroup =
  | "Invoicing and Job Management"
  | "Payroll and HR"
  | "Payments and Banking"
  | "Time Tracking"
  | "Inventory and Manufacturing"
  | "Reporting, Budgets and Forecasting"
  | "CRM and Marketing"
  | "Bills, Expenses and Approvals"
  | "E-commerce and Point of Sale"
  | "Accountant Tools and Practice Management"
  | "Documents and AI Automation"
  | "Tax and Compliance"
  | "Data Migration"
  | "Workflow Automation"
  | "Other";

export type IntegrationRegisterEntry = {
  code: string;
  name: string;
  publisher: string;
  kind: "native" | "partner_api" | "hybrid" | "csv_fallback";
  categoryGroups: IntegrationCategoryGroup[];
  registerStatus: IntegrationRegisterStatus;
  implementationStatus: ConnectorImplementationStatus | "n/a";
  installAvailable: boolean;
  e2eVerified: boolean;
  /** FAIL CLOSED gates — never true in seed data for live connectors. */
  securityReviewPassed: boolean;
  realCustomerDataEnabled: boolean;
  notes: string;
  csvFallbackPath: string | null;
  officialApiKnown: boolean | null;
  partnerCooperationRequired: boolean;
};

export function registerStatusFromImplementation(
  status: ConnectorImplementationStatus,
): IntegrationRegisterStatus {
  switch (status) {
    case "catalogue_only":
      return "Planned";
    case "adapter_scaffolded":
      return "In Development";
    case "credentials_blocked":
      return "Provider Approval Required";
    case "sandbox_partial":
      return "Testing";
    case "e2e_verified":
      return "Available";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/** Category group coverage for marketplace taxonomy (PRD ecosystem list). */
export const INTEGRATION_CATEGORY_GROUPS: readonly {
  group: IntegrationCategoryGroup;
  categoryCodes: string[];
  description: string;
}[] = [
  {
    group: "Invoicing and Job Management",
    categoryCodes: ["professional_services", "project_management"],
    description: "Sales documents, jobs and project billing.",
  },
  {
    group: "Payroll and HR",
    categoryCodes: ["payroll_hr"],
    description: "Pay runs, employees and workforce costs.",
  },
  {
    group: "Payments and Banking",
    categoryCodes: ["payment_gateways", "banking_financial"],
    description: "Processors, payouts and bank data.",
  },
  {
    group: "Time Tracking",
    categoryCodes: ["time_tracking"],
    description: "Timesheets and labour costing.",
  },
  {
    group: "Inventory and Manufacturing",
    categoryCodes: ["inventory_warehousing", "manufacturing"],
    description: "Stock, fulfilment, BOM and WIP.",
  },
  {
    group: "Reporting, Budgets and Forecasting",
    categoryCodes: ["reporting_analytics", "budgeting_forecasting"],
    description: "Reports, budgets and forecasts.",
  },
  {
    group: "CRM and Marketing",
    categoryCodes: ["crm"],
    description: "Contacts, pipelines and campaigns.",
  },
  {
    group: "Bills, Expenses and Approvals",
    categoryCodes: ["expense_management", "ap_automation", "ar_collections"],
    description: "Purchases, expenses and collections.",
  },
  {
    group: "E-commerce and Point of Sale",
    categoryCodes: ["ecommerce", "point_of_sale"],
    description: "Online stores and registers.",
  },
  {
    group: "Accountant Tools and Practice Management",
    categoryCodes: ["professional_services"],
    description: "Firm workflows and client practice tools.",
  },
  {
    group: "Documents and AI Automation",
    categoryCodes: ["document_capture", "automation_workflows"],
    description: "OCR, files and AI-assisted capture.",
  },
  {
    group: "Tax and Compliance",
    categoryCodes: ["tax_compliance"],
    description: "Tax filing and statutory packs.",
  },
  {
    group: "Data Migration",
    categoryCodes: ["other"],
    description: "CSV/API migration from other systems.",
  },
  {
    group: "Workflow Automation",
    categoryCodes: ["automation_workflows"],
    description: "Triggers, rules and orchestration.",
  },
];

function groupsForCategories(codes: string[]): IntegrationCategoryGroup[] {
  const groups = new Set<IntegrationCategoryGroup>();
  for (const entry of INTEGRATION_CATEGORY_GROUPS) {
    if (entry.categoryCodes.some((c) => codes.includes(c))) {
      groups.add(entry.group);
    }
  }
  if (groups.size === 0) groups.add("Other");
  return [...groups];
}

const EXTRA_REGISTER: readonly IntegrationRegisterEntry[] = [
  {
    code: "csv_sales_import",
    name: "CSV Sales Import",
    publisher: "LinkBooks",
    kind: "csv_fallback",
    categoryGroups: ["Invoicing and Job Management", "Data Migration"],
    registerStatus: "Available",
    implementationStatus: "n/a",
    installAvailable: false,
    e2eVerified: true,
    securityReviewPassed: true,
    realCustomerDataEnabled: false,
    notes: "Use Data Import Centre for invoice CSV imports when no live connector exists.",
    csvFallbackPath: "/imports",
    officialApiKnown: null,
    partnerCooperationRequired: false,
  },
  {
    code: "csv_purchases_import",
    name: "CSV Purchases Import",
    publisher: "LinkBooks",
    kind: "csv_fallback",
    categoryGroups: ["Bills, Expenses and Approvals", "Data Migration"],
    registerStatus: "Available",
    implementationStatus: "n/a",
    installAvailable: false,
    e2eVerified: true,
    securityReviewPassed: true,
    realCustomerDataEnabled: false,
    notes: "Use Data Import Centre for bill/expense CSV imports.",
    csvFallbackPath: "/imports",
    officialApiKnown: null,
    partnerCooperationRequired: false,
  },
  {
    code: "csv_contacts_products_import",
    name: "CSV Contacts & Products Import",
    publisher: "LinkBooks",
    kind: "csv_fallback",
    categoryGroups: ["CRM and Marketing", "Data Migration"],
    registerStatus: "Available",
    implementationStatus: "n/a",
    installAvailable: false,
    e2eVerified: true,
    securityReviewPassed: true,
    realCustomerDataEnabled: false,
    notes: "Import contacts and products via Data Import Centre.",
    csvFallbackPath: "/imports",
    officialApiKnown: null,
    partnerCooperationRequired: false,
  },
  {
    code: "bank_csv_import",
    name: "Bank Statement CSV Import",
    publisher: "LinkBooks",
    kind: "csv_fallback",
    categoryGroups: ["Payments and Banking", "Data Migration"],
    registerStatus: "Available",
    implementationStatus: "n/a",
    installAvailable: false,
    e2eVerified: true,
    securityReviewPassed: true,
    realCustomerDataEnabled: false,
    notes: "Banking CSV import and reconciliation — not a live bank feed connector.",
    csvFallbackPath: "/banking",
    officialApiKnown: null,
    partnerCooperationRequired: false,
  },
  {
    code: "xero_migration",
    name: "Xero Migration (CSV)",
    publisher: "LinkBooks",
    kind: "csv_fallback",
    categoryGroups: ["Data Migration"],
    registerStatus: "Available",
    implementationStatus: "n/a",
    installAvailable: false,
    e2eVerified: true,
    securityReviewPassed: true,
    realCustomerDataEnabled: false,
    notes: "Migration labels only — not a live Xero OAuth sync. Use Import & Migration.",
    csvFallbackPath: "/imports",
    officialApiKnown: true,
    partnerCooperationRequired: false,
  },
  {
    code: "quickbooks_migration",
    name: "QuickBooks Migration (CSV)",
    publisher: "LinkBooks",
    kind: "csv_fallback",
    categoryGroups: ["Data Migration"],
    registerStatus: "Available",
    implementationStatus: "n/a",
    installAvailable: false,
    e2eVerified: true,
    securityReviewPassed: true,
    realCustomerDataEnabled: false,
    notes: "Migration labels only — not a live QuickBooks connector.",
    csvFallbackPath: "/imports",
    officialApiKnown: true,
    partnerCooperationRequired: false,
  },
  {
    code: "guesty",
    name: "Guesty",
    publisher: "Third party",
    kind: "partner_api",
    categoryGroups: ["E-commerce and Point of Sale", "Inventory and Manufacturing"],
    registerStatus: "Research",
    implementationStatus: "catalogue_only",
    installAvailable: false,
    e2eVerified: false,
    securityReviewPassed: false,
    realCustomerDataEnabled: false,
    notes: "Hospitality PMS — feasibility depends on official API, licensing and partner approval.",
    csvFallbackPath: "/imports",
    officialApiKnown: null,
    partnerCooperationRequired: true,
  },
  {
    code: "hostaway",
    name: "Hostaway",
    publisher: "Third party",
    kind: "partner_api",
    categoryGroups: ["E-commerce and Point of Sale"],
    registerStatus: "Research",
    implementationStatus: "catalogue_only",
    installAvailable: false,
    e2eVerified: false,
    securityReviewPassed: false,
    realCustomerDataEnabled: false,
    notes: "Short-let PMS — research only; no partnership claimed.",
    csvFallbackPath: "/imports",
    officialApiKnown: null,
    partnerCooperationRequired: true,
  },
  {
    code: "salesforce",
    name: "Salesforce",
    publisher: "Third party",
    kind: "hybrid",
    categoryGroups: ["CRM and Marketing"],
    registerStatus: "Research",
    implementationStatus: "catalogue_only",
    installAvailable: false,
    e2eVerified: false,
    securityReviewPassed: false,
    realCustomerDataEnabled: false,
    notes: "CRM target — AppExchange-style partner or native OAuth TBD; not available.",
    csvFallbackPath: "/imports",
    officialApiKnown: true,
    partnerCooperationRequired: true,
  },
];

export function buildIntegrationRegister(): IntegrationRegisterEntry[] {
  const fromCatalogue: IntegrationRegisterEntry[] = DEFAULT_MARKETPLACE_APPS.map((app) => {
    const registerStatus = registerStatusFromImplementation(app.implementationStatus);
    const e2eVerified = app.implementationStatus === "e2e_verified";
    const securityReviewPassed = app.securityReviewPassed === true;
    const realCustomerDataEnabled = app.realCustomerDataEnabled === true;
    return {
      code: app.code,
      name: app.name,
      publisher: app.publisherName,
      kind: app.kind,
      categoryGroups: groupsForCategories(app.categoryCodes),
      registerStatus,
      implementationStatus: app.implementationStatus,
      installAvailable: e2eVerified && securityReviewPassed && realCustomerDataEnabled,
      e2eVerified,
      securityReviewPassed,
      realCustomerDataEnabled,
      notes: app.blockerNotes ?? "See App Store listing.",
      csvFallbackPath: e2eVerified ? null : "/imports",
      officialApiKnown: app.kind === "native" ? true : null,
      partnerCooperationRequired: app.kind === "partner_api" || app.kind === "hybrid",
    };
  });

  const codes = new Set(fromCatalogue.map((e) => e.code));
  const extras = EXTRA_REGISTER.filter((e) => !codes.has(e.code));
  return [...fromCatalogue, ...extras].sort((a, b) => a.name.localeCompare(b.name));
}

export function countRegisterByStatus(
  entries: readonly IntegrationRegisterEntry[] = buildIntegrationRegister(),
): Record<IntegrationRegisterStatus, number> {
  const counts = Object.fromEntries(INTEGRATION_REGISTER_STATUSES.map((s) => [s, 0])) as Record<
    IntegrationRegisterStatus,
    number
  >;
  for (const entry of entries) {
    counts[entry.registerStatus] += 1;
  }
  return counts;
}

/** Only Available + E2E + security gates may be offered as Install. */
export function isGenuinelyInstallable(entry: IntegrationRegisterEntry): boolean {
  return (
    entry.installAvailable &&
    entry.e2eVerified &&
    entry.securityReviewPassed &&
    entry.realCustomerDataEnabled &&
    entry.registerStatus === "Available"
  );
}
