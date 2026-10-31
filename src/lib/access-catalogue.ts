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
      { permission: "company.view", label: "Open this organisation", detail: "Required for every member." },
      { permission: "company.settings.edit", label: "Edit organisation settings", detail: "Name, financial year, documents and currencies." },
      { permission: "billing.manage", label: "Manage the subscription", detail: "Plan, trial and billing." },
      { permission: "demo.reset", label: "Reset the demo organisation", detail: "Demo companies only." },
    ],
  },
  {
    id: "people",
    label: "People and history",
    description: "Who can work in the organisation, and the audit trail.",
    items: [
      { permission: "members.view", label: "View people and roles", detail: "See who has access." },
      { permission: "members.manage", label: "Invite and manage people", detail: "Change roles, suspend and remove." },
      { permission: "members.grant_owner", label: "Transfer ownership", detail: "Add or replace a company owner." },
      { permission: "audit.view", label: "Review audit history", detail: "Administrative and financial events." },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    description: "Quotes, invoices, credit notes and customer payments.",
    items: [
      { permission: "sales.view", label: "View sales", detail: "Lists and documents." },
      { permission: "sales.draft", label: "Draft sales documents", detail: "Create and edit drafts." },
      { permission: "sales.authorise", label: "Authorise sales", detail: "Approve documents so they affect the ledger." },
      { permission: "sales.void", label: "Void sales", detail: "Cancel an authorised sales document." },
      { permission: "sales.payment", label: "Record customer payments", detail: "Receipts against invoices." },
    ],
  },
  {
    id: "purchases",
    label: "Purchases and expenses",
    description: "Bills, purchase orders, supplier payments and expense claims.",
    items: [
      { permission: "purchases.view", label: "View purchases", detail: "Lists and documents." },
      { permission: "purchases.draft", label: "Draft purchase documents", detail: "Create and edit drafts." },
      { permission: "purchases.authorise", label: "Authorise purchases", detail: "Approve bills and orders." },
      { permission: "purchases.payment", label: "Pay suppliers", detail: "Record and batch supplier payments." },
      { permission: "expenses.submit", label: "Submit expenses", detail: "File a claim for approval." },
      { permission: "expenses.approve", label: "Approve expenses", detail: "Accept or return a claim." },
    ],
  },
  {
    id: "banking",
    label: "Banking",
    description: "Accounts, imports, coding and reconciliation.",
    items: [
      { permission: "banking.view", label: "View banking", detail: "Accounts and transactions." },
      { permission: "banking.import", label: "Import bank statements", detail: "Bring statement lines in." },
      { permission: "banking.categorise", label: "Code bank lines", detail: "Suggest or set an account." },
      { permission: "banking.reconcile", label: "Reconcile", detail: "Match statement lines to the ledger." },
      { permission: "banking.feeds.manage", label: "Manage bank feeds", detail: "Connect or disconnect a feed." },
    ],
  },
  {
    id: "ledger",
    label: "Ledger",
    description: "Journals, the chart of accounts, periods and opening balances.",
    items: [
      { permission: "accounting.view", label: "View the ledger", detail: "Accounts, journals and balances." },
      { permission: "accounting.post", label: "Post to the ledger", detail: "Create posted accounting entries." },
      { permission: "journals.manual", label: "Manual journals", detail: "Draft and post a journal." },
      { permission: "accounts.manage", label: "Chart of accounts", detail: "Add and edit accounts, assets, budgets and projects." },
      { permission: "periods.lock", label: "Lock a period", detail: "Stop changes on or before a date." },
      { permission: "periods.unlock", label: "Unlock a closed period", detail: "Reopen a date that was locked." },
      { permission: "accounting.conversion.manage", label: "Conversion balances", detail: "Post or reverse opening balances." },
      { permission: "accounting.conversion.override", label: "Post before the conversion date", detail: "Exception for opening-balance corrections." },
      { permission: "recurring.auto_authorise", label: "Auto-authorise recurring documents", detail: "Let a schedule authorise without a person." },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    description: "Financial statements and exports.",
    items: [
      { permission: "reports.view", label: "View reports", detail: "Trial balance, profit and loss, balance sheet and the rest." },
      { permission: "reports.export", label: "Export reports", detail: "Download a report." },
    ],
  },
  {
    id: "master",
    label: "Contacts, products and tax",
    description: "Records used across sales, purchases and the ledger.",
    items: [
      { permission: "contacts.manage", label: "Manage contacts", detail: "Customers, suppliers and other contacts." },
      { permission: "products.manage", label: "Manage products and services", detail: "Items used on documents." },
      { permission: "tax.settings", label: "Tax settings", detail: "Tax codes and registration." },
    ],
  },
  {
    id: "assistance",
    label: "Assistance",
    description: "In-product guidance. Suggestions never post by themselves.",
    items: [
      { permission: "ai.use", label: "Use assistance", detail: "Ask questions and use voice navigation." },
      { permission: "ai.apply_suggestion", label: "Apply a suggestion", detail: "Turn a suggestion into a draft the person can still review." },
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
    if (!isPermission(adjustment.permission) || isRoleLockedPermission(adjustment.permission)) continue;
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
    if (!isPermission(adjustment.permission) || isRoleLockedPermission(adjustment.permission)) continue;
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
