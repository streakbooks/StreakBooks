import { createFileRoute, Outlet, useChildMatches } from "@tanstack/react-router";

import { MoneyDocumentsPage } from "@/screens/banking/money-documents";

export const Route = createFileRoute("/_authenticated/banking/money-documents")({
  head: () => ({ meta: [{ title: "Bank documents — LinkBooks" }] }),
  component: MoneyDocumentsRoute,
});

function MoneyDocumentsRoute() {
  const hasChild = useChildMatches({ select: (matches) => matches.length > 0 });
  return hasChild ? <Outlet /> : <MoneyDocumentsPage />;
}
