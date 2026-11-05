import { createFileRoute } from "@tanstack/react-router";

import { MoneyDocumentsPage } from "@/screens/banking/money-documents";

export const Route = createFileRoute("/_authenticated/banking/money-documents")({
  head: () => ({ meta: [{ title: "Bank documents — LinkBooks" }] }),
  component: MoneyDocumentsPage,
});
