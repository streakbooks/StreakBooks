import { createFileRoute } from "@tanstack/react-router";
import { BankImportContent } from "@/components/settings/BankImportContent";
type Search = { bankAccountId?: string };
export const Route = createFileRoute("/_authenticated/banking/import")({
  validateSearch: (s: Record<string, unknown>): Search =>
    typeof s["bankAccountId"] === "string" && s["bankAccountId"]
      ? { bankAccountId: s["bankAccountId"] }
      : {},
  head: () => ({ meta: [{ title: "Import statement — LinkBooks" }] }),
  component: BankImportContent,
});
