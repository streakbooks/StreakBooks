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
    phrases: ["invoices", "sales invoices", "customer invoices"],
  },
  {
    destination: "/purchases/bills",
    label: "Bills",
    requiredPermission: "purchases.view",
    phrases: ["bills", "supplier bills"],
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

const FORMS = [
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

export type VoiceDestination = (typeof VOICE_COMMANDS | typeof FORMS)[number]["destination"];
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
];

export function parseDeterministicCommand(transcript: string): ParseResult {
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
    .trim();
  const prefix = PREFIXES.find((candidate) => text.startsWith(candidate + " "));
  if (prefix) {
    const subject = text
      .slice(prefix.length)
      .trim()
      .replace(/^(the|my)\s+/, "");
    const command = VOICE_COMMANDS.find((entry) =>
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
