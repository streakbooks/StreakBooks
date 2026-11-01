import { PURCHASES_SECTIONS, SALES_SECTIONS } from "@/lib/document-sections";
import { navItems } from "@/lib/nav";
import type { Permission } from "@/lib/permissions";

// Adapted from 6cc0612 / 5b797f8 on feature/documents-folder-upload-fix.
// Only exact, predefined navigation and blank-form commands are exposed here.
export const VOICE_COMMANDS = [
  {
    destination: "/",
    label: "Dashboard",
    requiredPermission: "company.view",
    phrases: ["dashboard", "home", "overview"],
  },
  {
    destination: "/sales/invoices",
    label: "Invoices",
    requiredPermission: "sales.view",
    phrases: ["invoices", "invoice", "sales invoices", "customer invoices", "invoice list"],
  },
  {
    destination: "/purchases/bills",
    label: "Bills",
    requiredPermission: "purchases.view",
    phrases: ["bills", "bill", "supplier bills", "bill list", "purchase bills"],
  },
  {
    destination: "/banking",
    label: "Banking",
    requiredPermission: "banking.view",
    phrases: ["banking", "bank accounts", "bank transactions"],
  },
  {
    destination: "/contacts",
    label: "Contacts",
    requiredPermission: "company.view",
    phrases: ["contacts"],
  },
  { destination: "/sales", label: "Sales", requiredPermission: "sales.view", phrases: ["sales"] },
  {
    destination: "/purchases",
    label: "Purchases",
    requiredPermission: "purchases.view",
    phrases: ["purchases"],
  },
  {
    destination: "/reports",
    label: "Reports",
    requiredPermission: "reports.view",
    phrases: ["reports", "report centre", "financial reports"],
  },
  {
    destination: "/fixed-assets",
    label: "Fixed assets",
    requiredPermission: "accounting.view",
    phrases: ["fixed assets", "depreciation", "asset register"],
  },
] as const satisfies readonly {
  destination: string;
  label: string;
  requiredPermission: Permission;
  phrases: readonly string[];
}[];

const modulePermission: Record<string, Permission> = {
  "/banking": "banking.view",
  "/sales": "sales.view",
  "/purchases": "purchases.view",
  "/reports": "reports.view",
  "/accounting": "accounting.view",
  "/budgets": "accounting.view",
  "/fixed-assets": "accounting.view",
  "/tax": "accounting.view",
  "/ai-assistant": "ai.use",
};
const MODULE_NAV = navItems.map((item) => ({
  destination: item.to,
  label: item.label,
  requiredPermission: modulePermission[item.to] ?? "company.view",
  phrases: [item.label.toLowerCase(), item.label.toLowerCase().replace("&", "and")],
}));
const EXTRA_NAV = [
  {
    destination: "/sales/customers",
    label: "Customers",
    requiredPermission: "sales.view",
    phrases: ["customers"],
  },
  {
    destination: "/purchases/suppliers",
    label: "Suppliers",
    requiredPermission: "purchases.view",
    phrases: ["suppliers", "vendors"],
  },
  {
    destination: "/purchases/payments",
    label: "Supplier payments",
    requiredPermission: "purchases.view",
    phrases: ["payments", "supplier payments"],
  },
  {
    destination: "/purchases/expenses",
    label: "Expenses",
    requiredPermission: "purchases.view",
    phrases: ["expenses"],
  },
  {
    destination: "/banking/reconcile",
    label: "Bank reconciliation",
    requiredPermission: "banking.view",
    phrases: ["bank reconciliation", "reconciliation"],
  },
  {
    destination: "/accounting",
    label: "Chart of accounts",
    requiredPermission: "accounting.view",
    phrases: ["chart of accounts", "journal entries", "journals", "general ledger"],
  },
] as const;

const FORMS = [
  {
    destination: "/sales/quotes/new",
    label: "New quote form",
    requiredPermission: "sales.draft",
    phrases: ["quote", "estimate"],
  },
  {
    destination: "/sales/credit-notes/new",
    label: "New sales credit note",
    requiredPermission: "sales.draft",
    phrases: ["sales credit note", "credit note"],
  },
  {
    destination: "/purchases/expenses/new",
    label: "New expense form",
    requiredPermission: "expenses.submit",
    phrases: ["expense"],
  },
  {
    destination: "/sales/invoices/new",
    label: "New invoice form",
    requiredPermission: "sales.draft",
    phrases: ["invoice", "sales invoice", "customer invoice"],
  },
  {
    destination: "/purchases/bills/new",
    label: "New bill form",
    requiredPermission: "purchases.draft",
    phrases: ["bill", "supplier bill"],
  },
] as const;

export type VoiceDestination = string;
export type NavigationCommand = {
  destination: VoiceDestination;
  label: string;
  requiredPermission: Permission;
};
export type ParseResult =
  { kind: "matched"; command: NavigationCommand } | { kind: "unsupported"; message: string };

const PREFIXES = [
  "open",
  "show",
  "go to",
  "navigate to",
  "take me to",
  "view",
  "display",
  "switch to",
  "take me to",
  "bring up",
  "pull up",
  "head to",
  "jump to",
  "show me",
  "i want to see",
  "i need to see",
];

export function parseDeterministicCommand(transcript: string, location = ""): ParseResult {
  const unsupported: ParseResult = {
    kind: "unsupported",
    message: "Command not recognised. Try “open invoices” or “create invoice”.",
  };
  if (transcript.length > 1000) return unsupported;
  const text = transcript
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[.,!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:(?:please|kindly) |(?:can|could|would) you (?:please )?)/, "")
    .replace(/ please$/, "");
  if (/\\b(?:and then|then| or )\\b|[;\\/]/.test(text) || /^(?:do not|don\\u0027t|never)\\b/.test(text)) return unsupported;
  // Switch between actual Sales/Purchases navigation sections, never browser tabs.
  const tabDirection = /^(?:(?:go to|open|switch to|show|move to) (?:the )?)?(next|previous|prev) (?:tab|section)$/.exec(text)?.[1];
  if (tabDirection) {
    const module = location.startsWith("/purchases") ? "purchases" : location.startsWith("/sales") ? "sales" : null;
    if (!module) return unsupported;
    const sections = module === "purchases" ? PURCHASES_SECTIONS : SALES_SECTIONS;
    const current = sections.reduce((best, item, index) =>
      (location === item.to || location.startsWith(item.to + "/")) && item.to.length > (sections[best]?.to.length ?? -1)
        ? index : best, -1);
    const next = current + (tabDirection === "next" ? 1 : -1);
    if (current < 0 || next < 0 || next >= sections.length) return unsupported;
    return { kind: "matched", command: {
      destination: sections[next]!.to,
      label: sections[next]!.label,
      requiredPermission: module === "purchases" ? "purchases.view" : "sales.view",
    } };
  }
  const prefix = PREFIXES.find((candidate) => text.startsWith(candidate + " "));
  if (prefix) {
    const subject = text
      .slice(prefix.length)
      .trim()
      .replace(/^(the|my)\s+/, "");
    const sections = [
      ...PURCHASES_SECTIONS.map((item) => ({
        ...item,
        module: "purchases",
        permission: "purchases.view" as const,
      })),
      ...SALES_SECTIONS.map((item) => ({
        ...item,
        module: "sales",
        permission: "sales.view" as const,
      })),
    ];
    const section =
      sections.find(
        (item) =>
          subject === `${item.module} ${item.label.toLowerCase()}` ||
          (location.startsWith(`/${item.module}`) && subject === item.label.toLowerCase()),
      ) ??
      sections.find(
        (item) =>
          !["overview", "settings", "recurring", "statements", "credit notes"].includes(
            item.label.toLowerCase(),
          ) && subject === item.label.toLowerCase(),
      );
    if (section)
      return {
        kind: "matched",
        command: {
          destination: section.to,
          label: section.label,
          requiredPermission: section.permission,
        },
      };
    const command = [...VOICE_COMMANDS, ...EXTRA_NAV, ...MODULE_NAV].find((entry) =>
      entry.phrases.some((phrase) => subject === phrase),
    );
    if (command) return { kind: "matched", command };
  }
  const formSubject = /^(?:create|new|open new)\s+(?:(?:a|an)\s+)?(.+)$/.exec(text)?.[1];
  const form = FORMS.find((entry) => entry.phrases.some((phrase) => formSubject === phrase));
  return form ? { kind: "matched", command: form } : unsupported;
}

/** Same server-resolved permission list used by useCan; this is a UI hint only. */
export function canNavigateByVoice(
  command: NavigationCommand,
  permissions: readonly Permission[],
): boolean {
  if (!permissions.includes("company.view") || !permissions.includes(command.requiredPermission))
    return false;
  if (command.destination === "/sales/invoices/new") return permissions.includes("sales.view");
  if (command.destination === "/purchases/bills/new") return permissions.includes("purchases.view");
  return true;
}
