import { createFileRoute } from "@tanstack/react-router";
import { BankFeedsContent } from "@/components/settings/BankFeedsContent";
export const Route = createFileRoute("/_authenticated/banking/feeds")({
  head: () => ({ meta: [{ title: "Bank feeds — LinkBooks" }] }),
  component: BankFeedsContent,
});
