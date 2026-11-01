import type { SettingsCategory } from "./registry";
export type SettingsDestination = {
  to: string;
  section?: SettingsCategory;
  from?: "sales" | "purchases";
};
export type SettingsLink = SettingsDestination & { label: string; description: string };
/** Navigation only: every destination reuses an existing settings or setup screen. */
export const MODULE_SETTINGS_LINKS: Partial<Record<SettingsCategory, SettingsLink[]>> = {
  sales: [
    {
      label: "Invoice themes & branding",
      description: "Logos, document designs, PDF layouts and default themes.",
      to: "/documents/branding",
    },
    {
      label: "Document numbering",
      description: "Invoice, quote, credit note and receipt number sequences.",
      to: "/settings",
      section: "documents",
    },
    {
      label: "Invoice reminders",
      description: "Reminder schedules, delivery history and outstanding invoices.",
      to: "/sales/reminders",
    },
    {
      label: "Customer defaults",
      description: "Contact numbering, payment terms, groups and tags.",
      to: "/contacts/settings",
    },
    {
      label: "Customer portal",
      description: "Customer access and self-service document preferences.",
      to: "/settings",
      section: "portals",
    },
  ],
  purchases: [
    {
      label: "Document numbering",
      description: "Bill, purchase order and supplier credit number sequences.",
      to: "/settings",
      section: "documents",
    },
    {
      label: "Supplier defaults",
      description: "Contact numbering, payment terms, groups and tags.",
      to: "/contacts/settings",
    },
    {
      label: "Purchases configuration",
      description: "Existing bill policies and purchase preferences.",
      to: "/settings",
      section: "purchases",
    },
    {
      label: "Supplier portal",
      description: "Supplier access and document submission preferences.",
      to: "/settings",
      section: "portals",
    },
  ],
  banking: [
    {
      label: "Bank rules",
      description: "Manage transaction categorisation rules.",
      to: "/banking/rules",
    },
    {
      label: "Bank connections",
      description: "Review available feeds and their connection status.",
      to: "/banking/feeds",
    },
    {
      label: "Bank statement imports",
      description: "Import statement files and map their columns.",
      to: "/banking/import",
    },
  ],
  documents: [
    {
      label: "Invoice themes & branding",
      description: "Create and manage document layouts and branding.",
      to: "/documents/branding",
    },
    {
      label: "Sales settings",
      description: "Payment terms, quotes, invoice notes and related sales settings.",
      to: "/sales/settings",
    },
    {
      label: "Purchases settings",
      description: "Supplier terms, bill policies and related purchase settings.",
      to: "/purchases/settings",
    },
  ],
};
export const WORKSPACE_SETTINGS: Array<{
  prefix: string;
  label: string;
  destination: SettingsDestination;
  pinned?: boolean;
  rootHasSettingsLink?: boolean;
}> = [
  {
    prefix: "/sales",
    label: "Sales settings",
    destination: { to: "/sales/settings" },
    pinned: true,
  },
  {
    prefix: "/purchases",
    label: "Purchases settings",
    destination: { to: "/purchases/settings" },
    pinned: true,
  },
  {
    prefix: "/banking",
    label: "Banking settings",
    destination: { to: "/settings", section: "banking" },
    pinned: true,
  },
  {
    prefix: "/contacts",
    label: "Contacts settings",
    rootHasSettingsLink: true,
    destination: { to: "/contacts/settings" },
  },
  {
    prefix: "/accounting",
    label: "Accounting settings",
    destination: { to: "/settings", section: "accounting" },
  },
  {
    prefix: "/products-services",
    label: "Product settings",
    destination: { to: "/settings", section: "products" },
  },
  {
    prefix: "/reports",
    label: "Report settings",
    destination: { to: "/settings", section: "reports" },
  },
  {
    prefix: "/budgets",
    label: "Report settings",
    destination: { to: "/settings", section: "reports" },
  },
  { prefix: "/tax", label: "Tax settings", destination: { to: "/settings", section: "tax" } },
  {
    prefix: "/projects",
    label: "Tracking & project settings",
    destination: { to: "/settings", section: "dimensions" },
  },
  {
    prefix: "/files",
    label: "Document settings",
    destination: { to: "/settings", section: "documents" },
  },
  {
    prefix: "/fixed-assets",
    label: "Accounting settings",
    destination: { to: "/settings", section: "accounting" },
  },
  {
    prefix: "/accountant",
    label: "Accounting settings",
    destination: { to: "/settings", section: "accounting" },
  },
  {
    prefix: "/firm",
    label: "Organisation access settings",
    destination: { to: "/settings", section: "users" },
  },
  {
    prefix: "/ai-assistant",
    label: "Automation settings",
    destination: { to: "/settings", section: "automation" },
  },
];
export function workspaceSettingsFor(pathname: string) {
  const path = pathname.split(/[?#]/, 1)[0]!.replace(/\/+$/, "") || "/";
  return WORKSPACE_SETTINGS.find((m) => path === m.prefix || path.startsWith(m.prefix + "/"));
}
