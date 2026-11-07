import type { CompanyRole } from "@/lib/company-constants";
import { PERMISSIONS, permissionsForRole, type Permission } from "@/lib/permissions";

/**
 * Rights that follow the duty role. They cannot be granted or removed per person.
 * Operational access (documents, bank, ledger, reports) can be tailored.
 * The database function `assert_member_adjustments` is the authority for this list.
 */
export const ROLE_LOCKED_PERMISSIONS = [
  "company.view",
  "company.settings.edit",
  "members.view",
  "members.manage",
  "members.grant_owner",
  "billing.manage",
  "demo.reset",
] as const satisfies readonly Permission[];

export type AccessEffect = "grant" | "deny";

export type AccessAdjustment = {
  permission: Permission;
  effect: AccessEffect;
};

export type AccessArea = {
  id: string;
  label: string;
  description: string;
  items: ReadonlyArray<{ permission: Permission; label: string; detail: string }>;
};

export const ACCESS_AREAS: readonly AccessArea[] = [
  {
    id: "organisation",
    label: "Organisation",
    description: "The company record, subscription and demo tools.",
    items: [
      {
        permission: "company.view",
        label: "Open this organisation",
        detail: "Required for every member.",
      },
      {
        permission: "company.settings.edit",
        label: "Edit organisation settings",
        detail: "Name, financial year, documents and currencies.",
      },
      {
        permission: "billing.manage",
        label: "Manage the subscription",
        detail: "Plan, trial and billing.",
      },
      {
        permission: "billing.view",
        label: "View subscription and invoices",
        detail: "Plan, usage, invoices and payment status. Grant to an accountant when needed.",
      },
      {
        permission: "billing.payment_methods",
        label: "Manage recurring payment authorisation",
        detail: "Payment method and mandate for automatic renewals.",
      },
      {
        permission: "demo.reset",
        label: "Reset the demo organisation",
        detail: "Demo companies only.",
      },
    ],
  },
  {
    id: "people",
    label: "People and history",
    description: "Who can work in the organisation, and the audit trail.",
    items: [
      { permission: "members.view", label: "View people and roles", detail: "See who has access." },
      {
        permission: "members.manage",
        label: "Invite and manage people",
        detail: "Change roles, suspend and remove.",
      },
      {
        permission: "members.grant_owner",
        label: "Transfer ownership",
        detail: "Add or replace a company owner.",
      },
      {
        permission: "audit.view",
        label: "Review audit history",
        detail: "Administrative and financial events.",
      },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    description: "Quotes, invoices, credit notes and customer payments.",
    items: [
      { permission: "sales.view", label: "View sales", detail: "Lists and documents." },
      {
        permission: "sales.draft",
        label: "Draft sales documents",
        detail: "Create and edit drafts.",
      },
      {
        permission: "sales.authorise",
        label: "Authorise sales",
        detail: "Approve documents so they affect the ledger.",
      },
      {
        permission: "sales.void",
        label: "Void sales",
        detail: "Cancel an authorised sales document.",
      },
      {
        permission: "sales.payment",
        label: "Record customer payments",
        detail: "Receipts against invoices.",
      },
    ],
  },
  {
    id: "purchases",
    label: "Purchases",
    description: "Bills, purchase orders, company spend-money expenses and supplier payments.",
    items: [
      { permission: "purchases.view", label: "View purchases", detail: "Lists and documents." },
      {
        permission: "purchases.draft",
        label: "Draft purchase documents",
        detail: "Create and edit drafts.",
      },
      {
        permission: "purchases.authorise",
        label: "Authorise purchases",
        detail: "Approve bills and orders.",
      },
      {
        permission: "purchases.payment",
        label: "Pay suppliers",
        detail: "Record and batch supplier payments.",
      },
    ],
  },
  {
    id: "expenses",
    label: "Expense Management",
    description:
      "Standalone employee claims, receipts, approvals, reimbursements and expense controls.",
    items: [
      {
        permission: "expenses.view",
        label: "View organisation expenses",
        detail: "See claims across the company, not only your own.",
      },
      {
        permission: "expenses.submit",
        label: "Submit expenses",
        detail: "Create, edit and submit your own claims.",
      },
      {
        permission: "expenses.approve",
        label: "Approve expenses",
        detail: "Accept, reject or return a claim.",
      },
      {
        permission: "expenses.post",
        label: "Post expenses to the ledger",
        detail: "Create accounting journals for approved claims.",
      },
      {
        permission: "expenses.reimburse",
        label: "Reimburse expenses",
        detail: "Record or batch employee reimbursements.",
      },
      {
        permission: "expenses.manage_cards",
        label: "Manage corporate cards",
        detail: "Card register, assignment and matching.",
      },
      {
        permission: "expenses.manage_advances",
        label: "Manage cash advances",
        detail: "Issue, settle and recover employee advances.",
      },
      {
        permission: "expenses.manage_policies",
        label: "Manage expense policies",
        detail: "Categories, rates, settings and spending rules.",
      },
      {
        permission: "expenses.export",
        label: "Export expense data",
        detail: "Download claims, reimbursements and reports.",
      },
      {
        permission: "expenses.audit",
        label: "Audit expense activity",
        detail: "Read claim history and compliance events.",
      },
      {
        permission: "expenses.admin",
        label: "Administer expense management",
        detail: "Full module administration including destructive controls.",
      },
    ],
  },
  {
    id: "banking",
    label: "Banking",
    description: "Accounts, imports, coding and reconciliation.",
    items: [
      { permission: "banking.view", label: "View banking", detail: "Accounts and transactions." },
      {
        permission: "banking.import",
        label: "Import bank statements",
        detail: "Bring statement lines in.",
      },
      {
        permission: "banking.categorise",
        label: "Code bank lines",
        detail: "Suggest or set an account.",
      },
      {
        permission: "banking.reconcile",
        label: "Reconcile",
        detail: "Match statement lines to the ledger.",
      },
      {
        permission: "banking.feeds.manage",
        label: "Manage bank feeds",
        detail: "Connect or disconnect a feed.",
      },
    ],
  },
  {
    id: "ledger",
    label: "Ledger",
    description: "Journals, the chart of accounts, periods and opening balances.",
    items: [
      {
        permission: "accounting.view",
        label: "View the ledger",
        detail: "Accounts, journals and balances.",
      },
      {
        permission: "accounting.post",
        label: "Post to the ledger",
        detail: "Create posted accounting entries.",
      },
      {
        permission: "journals.manual",
        label: "Manual journals",
        detail: "Draft and post a journal.",
      },
      {
        permission: "journals.approve",
        label: "Approve correction journals",
        detail: "Independent approval of financial correction posting plans.",
      },
      {
        permission: "accounts.manage",
        label: "Chart of accounts",
        detail: "Add and edit accounts, assets, budgets and projects.",
      },
      {
        permission: "periods.lock",
        label: "Lock a period",
        detail: "Stop changes on or before a date.",
      },
      {
        permission: "periods.unlock",
        label: "Unlock a closed period",
        detail: "Reopen a date that was locked.",
      },
      {
        permission: "accounting.conversion.manage",
        label: "Conversion balances",
        detail: "Post or reverse opening balances.",
      },
      {
        permission: "accounting.conversion.override",
        label: "Post before the conversion date",
        detail: "Exception for opening-balance corrections.",
      },
      {
        permission: "recurring.auto_authorise",
        label: "Auto-authorise recurring documents",
        detail: "Let a schedule authorise without a person.",
      },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    description: "Financial statements and exports.",
    items: [
      {
        permission: "reports.view",
        label: "View reports",
        detail: "Trial balance, profit and loss, balance sheet and the rest.",
      },
      { permission: "reports.export", label: "Export reports", detail: "Download a report." },
    ],
  },
  {
    id: "master",
    label: "Contacts, products and tax",
    description: "Records used across sales, purchases and the ledger.",
    items: [
      {
        permission: "contacts.manage",
        label: "Manage contacts",
        detail: "Customers, suppliers and other contacts.",
      },
      {
        permission: "products.manage",
        label: "Manage products and services",
        detail: "Items used on documents.",
      },
      { permission: "tax.settings", label: "Tax settings", detail: "Tax codes and registration." },
    ],
  },
  {
    id: "payroll",
    label: "Payroll",
    description: "Employees, pay runs, settlements and payroll reports.",
    items: [
      {
        permission: "payroll.view",
        label: "View payroll",
        detail: "Open payroll settings, employees and runs.",
      },
      {
        permission: "payroll.settings.edit",
        label: "Edit payroll settings",
        detail: "Country, accounts, schedules and components.",
      },
      {
        permission: "payroll.employees.manage",
        label: "Manage payroll employees",
        detail: "Create and maintain employee payroll records.",
      },
      {
        permission: "payroll.run.prepare",
        label: "Prepare pay runs",
        detail: "Calculate and draft a payroll run.",
      },
      {
        permission: "payroll.run.approve",
        label: "Approve pay runs",
        detail: "Approve a prepared payroll run.",
      },
      {
        permission: "payroll.run.post",
        label: "Post payroll to the ledger",
        detail: "Create payroll journals.",
      },
      {
        permission: "payroll.pay",
        label: "Pay employees",
        detail: "Record or export payroll settlements.",
      },
      {
        permission: "payroll.reports.view",
        label: "View payroll reports",
        detail: "Payroll summaries and statutory-style exports.",
      },
    ],
  },
  {
    id: "appstore",
    label: "App Store & integrations",
    description: "Marketplace discovery, installations, connections, sync and exception handling.",
    items: [
      {
        permission: "appstore.view",
        label: "View App Store",
        detail: "Browse the catalogue and open integration workspaces.",
      },
      {
        permission: "appstore.request_install",
        label: "Request app installation",
        detail: "Submit an installation request for organisation approval.",
      },
      {
        permission: "appstore.install",
        label: "Install apps",
        detail: "Install verified connectors for the organisation.",
      },
      {
        permission: "appstore.manage_connections",
        label: "Manage connections",
        detail: "Reconnect, pause, resume or disconnect integrations.",
      },
      {
        permission: "appstore.manage_mappings",
        label: "Manage accounting mappings",
        detail: "Map external accounts, products and tax codes.",
      },
      {
        permission: "appstore.view_sync",
        label: "View synchronization activity",
        detail: "Inspect sync jobs, checkpoints and outcomes.",
      },
      {
        permission: "appstore.resolve_exceptions",
        label: "Resolve integration exceptions",
        detail: "Correct and retry failed integration records.",
      },
      {
        permission: "appstore.advise",
        label: "Advise client apps",
        detail: "Recommend and monitor apps for authorized client organisations.",
      },
      {
        permission: "appstore.manage_certification",
        label: "Manage app certification",
        detail: "Record certification reviews and reassessment outcomes.",
      },
      {
        permission: "developer.manage_apps",
        label: "Manage developer applications",
        detail: "Register publishers, OAuth clients and partner apps.",
      },
      {
        permission: "developer.submit_apps",
        label: "Submit apps for publication",
        detail: "Submit partner applications for marketplace review.",
      },
      {
        permission: "developer.partner_manage",
        label: "Manage partner program",
        detail: "Partner tiers, commercial terms and API access levels.",
      },
      {
        permission: "developer.view_analytics",
        label: "View publisher analytics",
        detail: "Genuine impressions, installs and conversion metrics.",
      },
      {
        permission: "developer.view_usage",
        label: "View API usage",
        detail: "Request quotas, rate limits and usage alerts.",
      },
    ],
  },
  {
    id: "assistance",
    label: "Assistance",
    description: "In-product guidance. Suggestions never post by themselves.",
    items: [
      {
        permission: "ai.use",
        label: "Use assistance",
        detail: "Ask questions and use voice navigation.",
      },
      {
        permission: "ai.apply_suggestion",
        label: "Apply a suggestion",
        detail: "Turn a suggestion into a draft the person can still review.",
      },
    ],
  },
];

const LOCKED = new Set<string>(ROLE_LOCKED_PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function isRoleLockedPermission(permission: Permission): boolean {
  return LOCKED.has(permission);
}

/** Fail closed. Unknown roles and owners ignore adjustments. Locked rights stay with the role. */
export function effectivePermissions(
  role: string | null | undefined,
  adjustments: readonly AccessAdjustment[] = [],
): readonly Permission[] {
  const baseline = permissionsForRole(role);
  if (baseline.length === 0 || role === "owner") return baseline;
  const granted = new Set<Permission>(baseline);
  for (const adjustment of adjustments) {
    if (!isPermission(adjustment.permission) || isRoleLockedPermission(adjustment.permission))
      continue;
    if (adjustment.effect === "grant") granted.add(adjustment.permission);
    else granted.delete(adjustment.permission);
  }
  return PERMISSIONS.filter((permission) => granted.has(permission));
}

/**
 * Keep only changes that differ from the duty role. Locked rights and no-ops are dropped
 * so the stored list matches what the database will accept.
 */
export function normaliseAdjustments(
  role: CompanyRole,
  adjustments: readonly AccessAdjustment[],
): AccessAdjustment[] {
  if (role === "owner") return [];
  const baseline = new Set(permissionsForRole(role));
  const seen = new Set<Permission>();
  const cleaned: AccessAdjustment[] = [];
  for (const adjustment of adjustments) {
    if (!isPermission(adjustment.permission) || isRoleLockedPermission(adjustment.permission))
      continue;
    if (seen.has(adjustment.permission)) continue;
    if (adjustment.effect !== "grant" && adjustment.effect !== "deny") continue;
    seen.add(adjustment.permission);
    const included = baseline.has(adjustment.permission);
    if (adjustment.effect === "grant" && !included) cleaned.push(adjustment);
    if (adjustment.effect === "deny" && included) cleaned.push(adjustment);
  }
  return cleaned;
}

/** Build grant/deny rows from the checkboxes the person currently has ticked. */
export function adjustmentsFromSelection(
  role: CompanyRole,
  selected: ReadonlySet<Permission>,
): AccessAdjustment[] {
  if (role === "owner") return [];
  const baseline = new Set(permissionsForRole(role));
  const draft: AccessAdjustment[] = [];
  for (const permission of PERMISSIONS) {
    if (isRoleLockedPermission(permission)) continue;
    const on = selected.has(permission);
    const included = baseline.has(permission);
    if (on && !included) draft.push({ permission, effect: "grant" });
    if (!on && included) draft.push({ permission, effect: "deny" });
  }
  return draft;
}

export function selectionFromEffective(permissions: readonly Permission[]): Set<Permission> {
  return new Set(permissions);
}
