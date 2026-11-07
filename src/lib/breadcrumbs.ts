import { navItems } from "@/lib/nav";

export type Breadcrumb = { label: string; to: string; current: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SEGMENT_LABEL: Record<string, string> = {
  "credit-notes": "Credit notes",
  "employee-expenses": "Employee expenses",
  "expense-management": "Expense Management",
  "my-expenses": "My Expenses",
  receipts: "Receipts & Inbox",
  "corporate-cards": "Corporate Cards",
  "exit-settlement": "Exit Settlement",
  "cash-advances": "Cash Advances",
  "spending-requests": "Spending Requests",
  "petty-cash": "Petty Cash",
  "money-documents": "Money documents",
  "cash-coding": "Cash coding",
  "profit-and-loss": "Profit and loss",
  "app-store": "App Store",
  explore: "Explore All Apps",
  categories: "Categories",
  featured: "Featured & Recommended",
  register: "Integration Register",
  "my-apps": "My Apps",
  connections: "Connections",
  "sync-activity": "Synchronization Activity",
  exceptions: "Integration Exceptions",
  requests: "App Requests",
  advisory: "Accountant Advisory",
  billing: "App Billing",
  reviews: "Ratings & Reviews",
  trust: "Trust & Certification",
  apps: "Apps",
  developer: "Developer",
  publisher: "Publisher Profile",
  applications: "My Applications",
  register: "Register Application",
  credentials: "API Credentials",
  oauth: "OAuth Configuration",
  "api-docs": "API Documentation",
  webhooks: "Webhooks",
  sandbox: "Sandbox & Testing",
  submission: "App Submission",
  versions: "Version Management",
  analytics: "Developer Analytics",
  usage: "API Usage",
  partner: "Partner Program",
  support: "Support",
  new: "New",
  edit: "Edit",
};

function humanize(segment: string): string {
  const known = SEGMENT_LABEL[segment];
  if (known) return known;
  if (UUID.test(segment) || /^\d+$/.test(segment)) return "Details";
  const s = decodeURIComponent(segment).replace(/[-_]+/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Breadcrumb trail for a pathname: the module (from the nav) then each nested segment.
 * Record ids become "Details". The dashboard has no trail. The last crumb is always `current`;
 * the caller decides which of the others are linkable (only paths that are real routes).
 */
export function buildBreadcrumbs(pathname: string, brandingOrigin?: unknown): Breadcrumb[] {
  if (pathname.split(/[?#]/, 1)[0]?.replace(/\/+$/, "") === "/documents/branding")
    return [
      {
        label: brandingOrigin === "purchases" ? "Purchases" : "Sales",
        to: brandingOrigin === "purchases" ? "/purchases" : "/sales",
        current: false,
      },
      {
        label: "Settings",
        to: brandingOrigin === "purchases" ? "/purchases/settings" : "/sales/settings",
        current: false,
      },
      {
        label:
          brandingOrigin === "purchases"
            ? "Purchase document themes & branding"
            : "Invoice themes & branding",
        to: "/documents/branding",
        current: true,
      },
    ];
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [];
  const crumbs: Breadcrumb[] = [];
  let acc = "";
  segments.forEach((seg, i) => {
    acc += `/${seg}`;
    const nav = i === 0 ? navItems.find((n) => n.to === acc) : undefined;
    crumbs.push({
      label: nav?.label ?? humanize(seg),
      to: acc,
      current: i === segments.length - 1,
    });
  });
  return crumbs;
}
