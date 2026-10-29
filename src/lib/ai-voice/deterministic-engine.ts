import { z } from "zod";
import { navItems } from "@/lib/nav";
import type { Permission } from "@/lib/permissions";

/**
 * Deterministic, allowlisted command interpreter.
 * No model, arbitrary URLs, SQL or user-supplied executable code.
 * This initial registry intentionally exposes navigation only.
 */
export const NavigationCommand = z.object({
  version: z.literal(1),
  intent: z.literal("navigate"),
  destination: z.string(),
  label: z.string(),
  requiredPermission: z.literal("company.view"),
  riskLevel: z.literal(1),
});
export type NavigationCommand = z.infer<typeof NavigationCommand>;
export const ReviewCommand = z.object({ version: z.literal(1), intent: z.literal("review"), review: z.enum(["duplicates", "reconcile", "unusual"]), requiredPermission: z.literal("banking.view"), riskLevel: z.literal(1) });
export type ReviewCommand = z.infer<typeof ReviewCommand>;
export type ParseResult =
  | { kind: "matched"; command: NavigationCommand | ReviewCommand }
  | { kind: "ambiguous"; candidates: string[] }
  | { kind: "unsupported"; message: string };

type CommandEntry = {
  label: string;
  path: string;
  phrases: readonly string[];
  permission: Permission;
};
const aliases: Record<string, readonly string[]> = {
  "/": ["dashboard", "home", "overview", "main dashboard"],
  "/sales": ["sales", "invoices", "sales invoices", "receivables", "customer invoices"],
  "/purchases": ["purchases", "bills", "supplier bills", "payables", "expenses"],
  "/banking": ["banking", "bank accounts", "bank transactions", "reconciliation"],
  "/contacts": ["contacts", "customers", "suppliers"],
  "/products-services": ["products", "services", "products and services", "items"],
  "/accounting": ["accounting", "chart of accounts", "general ledger", "journals"],
  "/reports": ["reports", "report centre", "financial reports", "profit and loss", "balance sheet", "trial balance"],
  "/tax": ["tax", "tax rates", "tax codes"],
  "/accountant": ["accountant", "month end checklist", "review queue"],
  "/firm": ["firm", "practice", "clients"],
  "/settings": ["settings", "preferences"],
  "/help": ["help", "support", "guides"],
  "/files": ["files", "attachments", "documents"],
  "/fixed-assets": ["fixed assets", "depreciation", "asset register"],
  "/budgets": ["budgets", "budgeting"],
  "/ai-assistant": ["ai assistant"],
};
const NAV: CommandEntry[] = navItems.filter((item) => aliases[item.to]).map((item) => ({
  label: item.label,
  path: item.to,
  phrases: aliases[item.to]!,
  permission: "company.view",
}));

const prefixes = ["open", "show", "go to", "navigate to", "take me to", "view", "display", "switch to"] as const;
function normalize(input: string) {
  return input.toLowerCase().normalize("NFKC").replace(/[.,!?]+/g, " ").replace(/\s+/g, " ").trim();
}
export function parseDeterministicCommand(transcript: string): ParseResult {
  if (transcript.length > 1000) return { kind: "unsupported", message: "Command is too long." };
  const text = normalize(transcript);
  if (!text) return { kind: "unsupported", message: "Enter a command." };
  const reviews: Record<string, "duplicates" | "reconcile" | "unusual"> = {
    "find possible duplicate bank transactions": "duplicates",
    "show possible duplicate bank transactions": "duplicates",
    "review duplicate bank transactions": "duplicates",
    "show reconciliation exceptions": "reconcile",
    "review reconciliation exceptions": "reconcile",
    "show uncategorised bank transactions": "reconcile",
    "show uncategorized bank transactions": "reconcile",
    "show unusual account movements": "unusual",
    "review unusual account movements": "unusual",
  };
  const review = reviews[text];
  if (review) return { kind: "matched", command: ReviewCommand.parse({
    version: 1, intent: "review", review, requiredPermission: "banking.view", riskLevel: 1,
  }) };
  const prefix = prefixes.find((p) => text.startsWith(p + " "));
  if (!prefix) return { kind: "unsupported", message: "This command is not supported yet. Try 'Open sales' or 'Show reports'." };
  const subject = text.slice(prefix.length).trim().replace(/^(the|my)\s+/, "");
  const matches = NAV.filter((entry) => entry.phrases.some((phrase) => subject === phrase));
  if (matches.length > 1) return { kind: "ambiguous", candidates: matches.map((m) => m.label) };
  if (matches.length !== 1) return { kind: "unsupported", message: "I couldn't identify a supported destination. Try 'Open banking'." };
  const match = matches[0]!;
  return { kind: "matched", command: NavigationCommand.parse({
    version: 1, intent: "navigate", destination: match.path,
    label: match.label, requiredPermission: match.permission, riskLevel: 1,
  }) };
}
export const supportedNavigationCommands = NAV.map(({ label, phrases }) => ({ label, phrases }));
