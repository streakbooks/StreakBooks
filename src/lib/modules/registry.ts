import { navItems } from "@/lib/nav";
import { SALES_SECTIONS, PURCHASES_SECTIONS } from "@/lib/document-sections";
import { EXPENSE_MANAGEMENT_SECTIONS } from "@/lib/expenses/sections";
import { APP_STORE_SECTIONS, DEVELOPER_PORTAL_SECTIONS } from "@/lib/app-store/sections";
import {
  DEFAULT_AUTHENTICATED_EXPERIENCE,
  DEFAULT_PUBLIC_EXPERIENCE,
  type ModuleDefinition,
  type ModuleSubnavItem,
} from "@/lib/modules/types";

const bankingSubnav: ModuleSubnavItem[] = [
  { to: "/banking", label: "Accounts", exact: true },
  { to: "/banking/transactions", label: "Transactions" },
  { to: "/banking/reconcile", label: "Reconcile" },
  { to: "/banking/cash-coding", label: "Cash coding" },
  { to: "/banking/transfers", label: "Transfers" },
  { to: "/banking/money-documents", label: "Bank documents" },
  { to: "/banking/rules", label: "Rules" },
  { to: "/banking/import", label: "Import CSV" },
  { to: "/banking/feeds", label: "Feeds" },
];

const payrollSubnav: ModuleSubnavItem[] = [
  { to: "/payroll", label: "Overview", exact: true },
  { to: "/payroll/employees", label: "Employees" },
  { to: "/payroll/salary-structures", label: "Salary structures" },
  { to: "/payroll/runs", label: "Runs" },
  { to: "/payroll/payslips", label: "Payslips" },
  { to: "/payroll/payments", label: "Payments" },
  { to: "/payroll/reports", label: "Reports" },
  { to: "/payroll/settings", label: "Settings" },
];

const advisorsAdminSubnav: ModuleSubnavItem[] = [
  { to: "/advisors-admin", label: "Overview", exact: true },
  { to: "/advisors-admin/inquiries", label: "Inquiries" },
  { to: "/advisors-admin/conversations", label: "Conversations" },
  { to: "/advisors-admin/clients", label: "Clients" },
  { to: "/advisors-admin/engagements", label: "Engagements" },
  { to: "/advisors-admin/onboarding", label: "Onboarding" },
  { to: "/advisors-admin/billing", label: "Billing" },
  { to: "/advisors-admin/workspaces", label: "Workspaces" },
  { to: "/advisors-admin/documents", label: "Documents" },
  { to: "/advisors-admin/appointments", label: "Appointments" },
  { to: "/advisors-admin/staff", label: "Advisors" },
  { to: "/advisors-admin/settings/services-pricing", label: "Services & Pricing" },
];

const advisorsPortalSubnav: ModuleSubnavItem[] = [
  { to: "/advisors-portal", label: "Home", exact: true },
  { to: "/advisors-portal/appointments", label: "Appointments" },
  { to: "/advisors-portal/documents", label: "Documents" },
  { to: "/advisors-portal/tasks", label: "Tasks" },
  { to: "/advisors-portal/messages", label: "Messages" },
  { to: "/advisors-portal/account", label: "Account" },
];

function sectionsToSubnav(
  sections: readonly { to: string; label: string; exact?: boolean }[],
): ModuleSubnavItem[] {
  return sections.map((s) => ({
    to: s.to,
    label: s.label,
    ...(s.exact ? { exact: true } : {}),
  }));
}

function pathSectionsToSubnav(
  sections: readonly { path: string; label: string; exact?: boolean }[],
): ModuleSubnavItem[] {
  return sections.map((s) => ({
    to: s.path,
    label: s.label,
    ...(s.exact ? { exact: true } : {}),
  }));
}

/**
 * Canonical module registry. Keep synchronized with `navItems` and real routes.
 * Adding a sidebar module without a registry entry fails `check:modules`.
 */
export const MODULE_REGISTRY: readonly ModuleDefinition[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Financial position at a glance",
    path: "/",
    group: "overview",
    inSidebar: true,
    pageKind: "dashboard",
    screenRoot: "src/screens",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "banking",
    label: "Banking",
    description: "Accounts and reconciliation",
    path: "/banking",
    group: "money",
    inSidebar: true,
    pageKind: "list",
    subnav: bankingSubnav,
    viewModes: ["list", "mobile-card"],
    screenRoot: "src/screens/banking",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "sales",
    label: "Sales",
    description: "Invoices and customer payments",
    path: "/sales",
    group: "money",
    inSidebar: true,
    pageKind: "list",
    subnav: sectionsToSubnav(SALES_SECTIONS),
    viewModes: ["list", "mobile-card"],
    screenRoot: "src/screens/sales",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "purchases",
    label: "Purchases",
    description: "Bills, expenses and suppliers",
    path: "/purchases",
    group: "money",
    inSidebar: true,
    pageKind: "list",
    subnav: sectionsToSubnav(PURCHASES_SECTIONS),
    viewModes: ["list", "mobile-card"],
    screenRoot: "src/screens/purchases",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "expense-management",
    label: "Expense Management",
    description: "Employee claims, receipts, approvals and reimbursements",
    path: "/expense-management",
    group: "money",
    inSidebar: true,
    pageKind: "list",
    subnav: pathSectionsToSubnav(EXPENSE_MANAGEMENT_SECTIONS),
    viewModes: ["list", "mobile-card"],
    screenRoot: "src/screens/expense-management",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "contacts",
    label: "Contacts",
    description: "Customers and suppliers",
    path: "/contacts",
    group: "records",
    inSidebar: true,
    pageKind: "list",
    tabKeys: ["all", "customers", "suppliers", "both", "recent", "updated", "inactive", "archived"],
    viewModes: ["list", "card", "mobile-card"],
    screenRoot: "src/screens/contacts",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "products-services",
    label: "Products & Services",
    description: "Items you sell and buy",
    path: "/products-services",
    group: "records",
    inSidebar: true,
    pageKind: "list",
    screenRoot: "src/screens/products-services.tsx",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "files",
    label: "Files",
    description: "Attachments and uploaded documents",
    path: "/files",
    group: "records",
    inSidebar: true,
    pageKind: "list",
    screenRoot: "src/screens",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "accounting",
    label: "Accounting",
    description: "Chart of accounts, journals, ledger",
    path: "/accounting",
    group: "accounting",
    inSidebar: true,
    pageKind: "tool",
    tabKeys: [
      "coa",
      "industry",
      "journals",
      "post",
      "periods",
      "close",
      "health",
      "exceptions",
      "conversion",
      "fx",
      "corrections",
      "deferrals",
      "cash-classification",
    ],
    screenRoot: "src/screens/accounting",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "budgets",
    label: "Budgets",
    description: "Plan income and expenses by month",
    path: "/budgets",
    group: "accounting",
    inSidebar: true,
    pageKind: "list",
    screenRoot: "src/screens",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "fixed-assets",
    label: "Fixed assets",
    description: "Asset register and depreciation",
    path: "/fixed-assets",
    group: "accounting",
    inSidebar: true,
    pageKind: "list",
    tabKeys: ["dashboard", "register", "depreciation", "types", "bill-review", "reconciliation"],
    screenRoot: "src/screens",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "payroll",
    label: "Payroll",
    description: "Basic Global Payroll settings and processing",
    path: "/payroll",
    group: "accounting",
    inSidebar: true,
    pageKind: "list",
    subnav: payrollSubnav,
    screenRoot: "src/screens/payroll",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
    notes: "Basic Global Payroll — not a claim of full multi-jurisdiction statutory compliance.",
  },
  {
    id: "reports",
    label: "Reports",
    description: "Reports Centre and financial statements",
    path: "/reports",
    group: "accounting",
    inSidebar: true,
    pageKind: "report",
    tabKeys: [
      "standard",
      "home",
      "custom",
      "management",
      "packs",
      "adviser",
      "drafts",
      "published",
      "archived",
      "schedules",
      "templates",
    ],
    viewModes: ["list", "graph", "pivot"],
    screenRoot: "src/screens/reports",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "tax",
    label: "Tax",
    description: "Rates, codes and tax accounts",
    path: "/tax",
    group: "accounting",
    inSidebar: true,
    pageKind: "tool",
    tabKeys: ["overview", "registration", "returns", "rates", "codes", "mappings", "packs"],
    screenRoot: "src/screens",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "accountant",
    label: "Accountant",
    description: "Period-end checklist and review",
    path: "/accountant",
    group: "practice",
    inSidebar: true,
    pageKind: "tool",
    tabKeys: [
      "overview",
      "client-work",
      "workpapers",
      "journals",
      "reconciliation",
      "period-close",
      "tax-adjustments",
    ],
    screenRoot: "src/screens",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "firm",
    label: "Firm",
    description: "Practice and client access",
    path: "/firm",
    group: "practice",
    inSidebar: true,
    pageKind: "dashboard",
    screenRoot: "src/screens",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "advisors-admin",
    label: "Advisors",
    description: "Advisors inquiries, clients and delivery",
    path: "/advisors-admin",
    group: "practice",
    inSidebar: true,
    pageKind: "list",
    subnav: advisorsAdminSubnav,
    screenRoot: "src/screens/advisors",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "advisors-portal",
    label: "Advisors portal",
    description: "Customer Advisors plan, appointments and documents",
    path: "/advisors-portal",
    group: "practice",
    inSidebar: true,
    pageKind: "portal",
    subnav: advisorsPortalSubnav,
    screenRoot: "src/screens/advisors-portal",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "action-center",
    label: "Action Center",
    description: "Actionable approvals, overdue invoices, bank and document alerts",
    path: "/notifications",
    group: "tools",
    inSidebar: true,
    pageKind: "list",
    screenRoot: "src/screens",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "app-store",
    label: "App Store",
    description: "Integrations marketplace and connections",
    path: "/app-store",
    group: "tools",
    inSidebar: true,
    pageKind: "list",
    subnav: pathSectionsToSubnav(APP_STORE_SECTIONS),
    screenRoot: "src/screens/app-store",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "developer",
    label: "Developer",
    description: "Public API, OAuth apps and partner publishing",
    path: "/developer",
    group: "tools",
    inSidebar: true,
    pageKind: "tool",
    subnav: pathSectionsToSubnav(DEVELOPER_PORTAL_SECTIONS),
    screenRoot: "src/screens/developer",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "ai-assistant",
    label: "AI Assistant",
    description: "Accounting guidance and review",
    path: "/ai-assistant",
    group: "tools",
    inSidebar: true,
    pageKind: "tool",
    screenRoot: "src/screens/ai-assistant.tsx",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "settings",
    label: "Settings",
    description: "Organisation and preferences",
    path: "/settings",
    group: "footer",
    inSidebar: true,
    pageKind: "settings",
    screenRoot: "src/screens",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "help",
    label: "Help",
    description: "Guides and support",
    path: "/help",
    group: "footer",
    inSidebar: true,
    pageKind: "tool",
    screenRoot: "src/screens",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  // Hidden / non-sidebar operational surfaces discovered in the route tree.
  {
    id: "platform",
    label: "Platform",
    description: "Superadmin / platform control centre",
    path: "/platform",
    group: "tools",
    inSidebar: false,
    pageKind: "tool",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "profile",
    label: "Profile",
    description: "User profile",
    path: "/profile",
    group: "footer",
    inSidebar: false,
    pageKind: "settings",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "onboarding",
    label: "Onboarding",
    description: "Company onboarding",
    path: "/onboarding",
    group: "overview",
    inSidebar: false,
    pageKind: "wizard",
    experience: DEFAULT_AUTHENTICATED_EXPERIENCE,
    premiumStatus: "partial",
  },
  {
    id: "auth",
    label: "Auth",
    description: "Sign-in and session",
    path: "/auth",
    group: "footer",
    inSidebar: false,
    pageKind: "public",
    experience: DEFAULT_PUBLIC_EXPERIENCE,
    premiumStatus: "partial",
  },
] as const;

export function getModuleById(id: string): ModuleDefinition | undefined {
  return MODULE_REGISTRY.find((module) => module.id === id);
}

export function getModuleByPath(path: string): ModuleDefinition | undefined {
  const normalized = path === "" ? "/" : path;
  return MODULE_REGISTRY.find((module) => module.path === normalized);
}

/** Sidebar modules must stay 1:1 with `navItems` labels and paths. */
export function assertRegistryMatchesNav(): string[] {
  const failures: string[] = [];
  const sidebar = MODULE_REGISTRY.filter((module) => module.inSidebar);
  for (const item of navItems) {
    const match = sidebar.find((module) => module.label === item.label && module.path === item.to);
    if (!match) {
      failures.push(`nav item missing from MODULE_REGISTRY: ${item.label} -> ${item.to}`);
    }
  }
  for (const module of sidebar) {
    const match = navItems.find((item) => item.label === module.label && item.to === module.path);
    if (!match) {
      failures.push(`MODULE_REGISTRY sidebar entry missing from navItems: ${module.label}`);
    }
  }
  if (sidebar.length !== navItems.length) {
    failures.push(
      `Sidebar registry count ${sidebar.length} !== navItems count ${navItems.length}`,
    );
  }
  const ids = new Set<string>();
  for (const module of MODULE_REGISTRY) {
    if (ids.has(module.id)) failures.push(`Duplicate module id: ${module.id}`);
    ids.add(module.id);
  }
  return failures;
}
