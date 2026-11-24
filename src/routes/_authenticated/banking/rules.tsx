import { createFileRoute } from "@tanstack/react-router";
import { BankRulesContent } from "@/components/settings/BankRulesContent";
type Search = { review?: string };
export const Route = createFileRoute("/_authenticated/banking/rules")({
  validateSearch: (s: Record<string, unknown>): Search =>
    typeof s["review"] === "string" ? { review: s["review"] } : {},
  head: () => ({ meta: [{ title: "Bank rules — StreakBooks" }] }),
  component: BankRulesContent,
});
