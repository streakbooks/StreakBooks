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
    id: "pos",
    label: "Point of Sale",
    description: "Location-scoped registers and physical cash counts.",
    items: [
      {
        permission: "pos.view",
        label: "View POS",
        detail: "Catalogue preview and assigned registers.",
      },
      {
        permission: "pos.settings.manage",
        label: "Manage POS setup",
        detail: "Cash mappings and cashier location access.",
      },
      {
        permission: "pos.register.open",
        label: "Open register",
        detail: "Declare a physical opening float.",
      },
      {
        permission: "pos.register.close",
        label: "Close register",
        detail: "Close own sessions; supervisors with setup access can close others.",
      },
      {
        permission: "pos.cash.count",
        label: "Count cash",
        detail: "Required together with close-register permission.",
      },
      {
        permission: "pos.sale.create",
        label: "Complete cash sales",
        detail: "Checkout catalogue items for cash on an open register session.",
      },
      {
        permission: "pos.cash.adjust",
        label: "Adjust drawer cash",
        detail: "Record controlled cash in or cash out on an open session.",
      },
      {
        permission: "pos.refund.create",
        label: "Refund cash sales",
        detail: "Reverse a completed cash sale while the original session stays open.",
      },
      {
        permission: "pos.audit.view",
        label: "Review POS audit",
        detail: "Reserved for the POS audit-review workflow.",
      },
    ],
  },
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
    id: "property-management",
    label: "Property Management",
    description: "Portfolios, owners, rentals, statements and settlement controls.",
    items: [
      {
        permission: "property.view",
        label: "View Property Management",
        detail: "Open portfolio dashboards and registers.",
      },
      {
        permission: "property.manage",
        label: "Manage properties and units",
        detail: "Create and update properties, units and agreements.",
      },
      {
        permission: "property.owner.view",
        label: "View owners",
        detail: "View owner overlays and ownership shares.",
      },
      {
        permission: "property.owner.manage",
        label: "Manage owners",
        detail: "Link contacts as owners and maintain ownership.",
      },
      {
        permission: "property.tenant.manage",
        label: "Manage tenants",
        detail: "Maintain tenant and guest records.",
      },
      {
        permission: "property.lease.manage",
        label: "Manage leases",
        detail: "Create and update long-term leases.",
      },
      {
        permission: "property.reservation.manage",
        label: "Manage reservations",
        detail: "Create and update short-term reservations.",
      },
      {
        permission: "property.rent.manage",
        label: "Manage rent and charges",
        detail: "Schedule rent, adjustments and collections.",
      },
      {
        permission: "property.expenses.manage",
        label: "Manage property expenses",
        detail: "Allocate expenses and maintenance costs.",
      },
      {
        permission: "property.commission.manage",
        label: "Manage commissions",
        detail: "Configure and calculate management fees.",
      },
      {
        permission: "property.statements.view",
        label: "View owner statements",
        detail: "Open owner statement history and previews.",
      },
      {
        permission: "property.statements.generate",
        label: "Generate owner statements",
        detail: "Create draft owner statements.",
      },
      {
        permission: "property.statements.approve",
        label: "Approve owner statements",
        detail: "Approve and lock statement snapshots.",
      },
      {
        permission: "property.statements.publish",
        label: "Publish owner statements",
        detail: "Publish statements to portals and delivery.",
      },
      {
        permission: "property.payouts.prepare",
        label: "Prepare owner payouts",
        detail: "Calculate eligible distributions.",
      },
      {
        permission: "property.payouts.approve",
        label: "Approve owner payouts",
        detail: "Authorise distribution amounts.",
      },
      {
        permission: "property.payouts.record",
        label: "Record owner payouts",
        detail: "Post paid distributions and reconciliations.",
      },
      {
        permission: "property.trust.reconcile",
        label: "Reconcile trust accounts",
        detail: "Run trust and beneficiary reconciliations.",
      },
      {
        permission: "property.reports.view",
        label: "View property reports",
        detail: "Open property and portfolio reports.",
      },
      {
        permission: "property.reports.export",
        label: "Export property reports",
        detail: "Export property and owner reports.",
      },
      {
        permission: "property.integrations.manage",
        label: "Manage PM integrations",
        detail: "Configure PMS connections and imports.",
      },
      {
        permission: "property.settings.manage",
        label: "Property Management settings",
        detail: "Enable the module and configure policies.",
      },
      {
        permission: "property.audit.view",
        label: "View property audit",
        detail: "Inspect property audit evidence.",
      },
    ],
  },
  {
    id: "crm",
    label: "CRM",
    description: "Leads, opportunities, campaigns and sales pipeline workflows.",
    items: [
      {
        permission: "crm.view",
        label: "View CRM",
        detail: "Open CRM dashboards, leads and opportunities.",
      },
      {
        permission: "crm.leads.manage",
        label: "Manage leads",
        detail: "Create and update leads.",
      },
      {
        permission: "crm.opportunities.manage",
        label: "Manage opportunities",
        detail: "Create and update opportunities and stages.",
      },
      {
        permission: "crm.activities.manage",
        label: "Manage CRM activities",
        detail: "Log calls, meetings and tasks.",
      },
      {
        permission: "crm.campaigns.manage",
        label: "Manage campaigns",
        detail: "Create and track marketing campaigns.",
      },
      {
        permission: "crm.automation.manage",
        label: "Manage CRM automation",
        detail: "Configure CRM workflow automations.",
      },
      {
        permission: "crm.reports.view",
        label: "View CRM reports",
        detail: "Pipeline and conversion analytics.",
      },
      {
        permission: "crm.export",
        label: "Export CRM data",
        detail: "Export leads and opportunities.",
      },
      {
        permission: "crm.import",
        label: "Import CRM data",
        detail: "Bulk import CRM records.",
      },
      {
        permission: "crm.admin",
        label: "CRM administration",
        detail: "Configure CRM settings and pipelines.",
      },
    ],
  },
  {
    id: "hr",
    label: "HR Management",
    description: "Workforce directory, organisation, leave, attendance and lifecycle workflows.",
    items: [
      {
        permission: "hr.view",
        label: "View HR",
        detail: "Open HR overview, directory and organisation structure.",
      },
      {
        permission: "hr.employees.manage",
        label: "Manage employees",
        detail: "Maintain HR profiles linked to the shared workforce identity.",
      },
      {
        permission: "hr.employees.sensitive",
        label: "Sensitive employee fields",
        detail: "View compensation references and other restricted HR fields.",
      },
      {
        permission: "hr.organization.manage",
        label: "Manage organisation",
        detail: "Locations, branches, departments and designations.",
      },
      {
        permission: "hr.recruitment.manage",
        label: "Manage recruitment",
        detail: "Requisitions, applications, interviews and offers.",
      },
      {
        permission: "hr.onboarding.manage",
        label: "Manage onboarding",
        detail: "Onboarding templates, cases and task checklists.",
      },
      {
        permission: "hr.attendance.manage",
        label: "Manage attendance",
        detail: "Attendance logs, corrections and shift templates.",
      },
      {
        permission: "hr.leave.manage",
        label: "Manage leave",
        detail: "Leave types, balances, holidays and admin requests.",
      },
      {
        permission: "hr.leave.approve",
        label: "Approve leave",
        detail: "Approve or reject submitted leave requests.",
      },
      {
        permission: "hr.performance.manage",
        label: "Manage performance",
        detail: "Goals, reviews and performance workflows.",
      },
      {
        permission: "hr.cases.manage",
        label: "Manage HR cases",
        detail: "Employee relations and disciplinary cases.",
      },
      {
        permission: "hr.approvals.manage",
        label: "Manage HR approvals",
        detail: "Configure and oversee multilevel HR approvals.",
      },
      {
        permission: "hr.settings.edit",
        label: "Edit HR settings",
        detail: "Enable HR and configure organisation defaults.",
      },
      {
        permission: "hr.audit.view",
        label: "View HR audit trail",
        detail: "Inspect sensitive HR change history.",
      },
      {
        permission: "hr.self_service",
        label: "Employee self-service",
        detail: "Access personal HR requests when linked to an employee profile.",
      },
      {
        permission: "hr.manager",
        label: "Manager workspace",
        detail: "Approve team requests and view team exceptions.",
      },
      {
        permission: "hr.reports.view",
        label: "View HR reports",
        detail: "Workforce analytics and operational HR reports.",
      },
      {
        permission: "hr.export",
        label: "Export HR data",
        detail: "Export workforce and leave reports.",
      },
      {
        permission: "hr.import",
        label: "Import HR data",
        detail: "Bulk import workforce structures and balances.",
      },
    ],
  },
  {
    id: "messaging",
    label: "Messaging & collaboration",
    description: "Internal chat, groups, record discussions and external portal messaging.",
    items: [
      {
        permission: "messaging.view",
        label: "View messages",
        detail: "Open the Messages workspace and read authorised conversations.",
      },
      {
        permission: "messaging.send",
        label: "Send messages",
        detail: "Post to conversations you belong to.",
      },
      {
        permission: "messaging.create",
        label: "Start conversations",
        detail: "Create direct messages with eligible participants.",
      },
      {
        permission: "messaging.create_group",
        label: "Create groups",
        detail: "Create organisation or departmental group conversations.",
      },
      {
        permission: "messaging.manage_group",
        label: "Manage groups",
        detail: "Rename groups, transfer ownership and manage members.",
      },
      {
        permission: "messaging.invite_internal",
        label: "Invite internal people",
        detail: "Add organisation members to conversations within your scope.",
      },
      {
        permission: "messaging.invite_external",
        label: "Invite external participants",
        detail: "Invite portal customers, vendors or advisors when enabled.",
      },
      {
        permission: "messaging.share_files",
        label: "Share files in chat",
        detail: "Upload and open authorised messaging attachments.",
      },
      {
        permission: "messaging.link_records",
        label: "Link transactions",
        detail: "Open or create discussions linked to business records.",
      },
      {
        permission: "messaging.manage_external",
        label: "Manage external messaging",
        detail: "Configure customer and vendor conversation visibility.",
      },
      {
        permission: "messaging.manage_settings",
        label: "Messaging settings",
        detail: "Enable messaging features and organisation defaults.",
      },
      {
        permission: "messaging.view_audit",
        label: "View messaging audit",
        detail: "Inspect messaging audit and moderation events.",
      },
      {
        permission: "messaging.manage_retention",
        label: "Manage retention",
        detail: "Configure retention and legal hold policies.",
      },
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
    id: "nonprofit",
    label: "Nonprofit Management",
    description: "Funds, donations, grants and restricted-resource controls.",
    items: [
      {
        permission: "nonprofit.view",
        label: "View Nonprofit Management",
        detail: "Open dashboards, funds and registers.",
      },
      {
        permission: "nonprofit.manage",
        label: "Manage nonprofit records",
        detail: "Create campaigns, programmes and operational records.",
      },
      {
        permission: "nonprofit.post",
        label: "Post nonprofit journals",
        detail: "Post donations, grants and fund movements through the ledger.",
      },
      {
        permission: "nonprofit.approve",
        label: "Approve nonprofit work",
        detail: "Approve items that are waiting for a second person.",
      },
      {
        permission: "nonprofit.reverse",
        label: "Reverse nonprofit postings",
        detail: "Refund a posted donation or chargeback.",
      },
      {
        permission: "nonprofit.export",
        label: "Export nonprofit reports",
        detail: "Download fund and donation reports.",
      },
      {
        permission: "nonprofit.funds.manage",
        label: "Manage funds",
        detail: "Create, open and close funds.",
      },
      {
        permission: "nonprofit.grants.approve",
        label: "Approve grants",
        detail: "Record awards and confirm grant conditions.",
      },
      {
        permission: "nonprofit.restrictions.release",
        label: "Release restrictions",
        detail: "Reclassify restricted resources when the purpose is met.",
      },
      {
        permission: "nonprofit.allocations.manage",
        label: "Allocate expenses",
        detail: "Split functional expenses without exceeding the original amount.",
      },
      {
        permission: "nonprofit.disbursements.approve",
        label: "Approve disbursements",
        detail: "Authorise assistance payments.",
      },
      {
        permission: "nonprofit.compliance.manage",
        label: "Manage compliance reminders",
        detail: "Keep registration and filing reminders. This does not submit a return.",
      },
      {
        permission: "nonprofit.admin",
        label: "Administer Nonprofit Management",
        detail: "Activate the module and map ledger accounts.",
      },
      {
        permission: "nonprofit.donors.manage",
        label: "Manage donors",
        detail: "Create donor records and communication preferences.",
      },
      {
        permission: "nonprofit.donations.manage",
        label: "Manage donations",
        detail: "Record donations, pledges and receipts.",
      },
      {
        permission: "nonprofit.beneficiaries.view",
        label: "View beneficiaries",
        detail: "Open confidential beneficiary records.",
      },
      {
        permission: "nonprofit.portal.manage",
        label: "Manage portals",
        detail: "Grant donor, volunteer, member and grantor portal access.",
      },
    ],
  },
  {
    id: "gym",
    label: "Gym & Fitness",
    description: "Memberships, scheduling and deferred revenue on the StreakBooks ledger.",
    items: [
      { permission: "gym.view", label: "View Gym & Fitness", detail: "Open the dashboard, registers and reports." },
      { permission: "gym.manage", label: "Manage gym operations", detail: "Maintain branches, leads and equipment." },
      { permission: "gym.post", label: "Post gym journals", detail: "Post membership, receipt and recognition journals." },
      { permission: "gym.approve", label: "Approve gym amounts", detail: "Approve trainer commission before it is posted." },
      { permission: "gym.reverse", label: "Reverse gym postings", detail: "Refund or forfeit unrecognised membership balances." },
      { permission: "gym.export", label: "Export gym reports", detail: "Download member statements and management reports." },
      { permission: "gym.admin", label: "Administer Gym & Fitness", detail: "Activate the module and map ledger accounts." },
      { permission: "gym.members.manage", label: "Manage members", detail: "Create members and change membership lifecycle." },
      { permission: "gym.plans.manage", label: "Manage plans", detail: "Add a new price version without rewriting old contracts." },
      { permission: "gym.schedule.manage", label: "Manage the schedule", detail: "Book appointments and classes." },
      { permission: "gym.attendance.manage", label: "Record attendance", detail: "Check members in when their membership allows it." },
      { permission: "gym.trainers.manage", label: "Manage trainers", detail: "Keep trainer profiles and commission terms." },
      { permission: "gym.billing.manage", label: "Manage gym billing", detail: "Record receipts, packages and vouchers." },
      { permission: "gym.portal.manage", label: "Link member portal access", detail: "Connect a sign-in to one member record." },
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
