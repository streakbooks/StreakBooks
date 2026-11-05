import { PURCHASES_SECTIONS, SALES_SECTIONS } from "@/lib/document-sections";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useRouterState,
} from "@tanstack/react-router";
import { VoiceAssistant } from "@/components/ai-voice/VoiceAssistant";
import { VoiceProvider } from "@/components/ai-voice/VoiceProvider";
import { SalesDocumentEditor } from "@/components/sales/SalesDocumentEditor";
import { NewBill } from "@/screens/purchases/bills.new";
import { useActiveCompany } from "./fixture-state";
import { navItems } from "@/lib/nav";
import { queryClient } from "./fixture-state";
import "@/styles.css";

export function Layout() {
  const { userId } = useActiveCompany();
  return (
    <VoiceProvider userId={userId}>
      <main>
        <header className="flex items-center gap-4 p-4">
          <Link to="/">Dashboard link</Link>
          <Link to="/contacts" search={{ view: undefined }}>
            Contacts link
          </Link>
          <div className="ml-auto">
            <VoiceAssistant />
          </div>
        </header>
        <Outlet />
      </main>
    </VoiceProvider>
  );
}
export function Destination() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const { company } = useActiveCompany();
  return (
    <div key={company?.id}>
      <h1>Destination: {path}</h1>
      {path === "/sales/invoices/new" ? (
        <SalesDocumentEditor kind="invoice" />
      ) : path === "/sales/quotes/new" ? (
        <SalesDocumentEditor kind="quote" />
      ) : path === "/sales/credit-notes/linked" ? (
        <SalesDocumentEditor
          kind="credit_note"
          existing={{
            id: "00000000-0000-4000-8000-000000000098",
            contactId: "00000000-0000-4000-8000-000000000001",
            date: "2026-10-31",
            secondDate: null,
            number: "CR-LOCK",
            memo: null,
            currencyCode: "GBP",
            fxRateToBase: 1,
            sourceInvoiceId: "00000000-0000-4000-8000-000000000097",
            lines: [],
          }}
        />
      ) : path === "/sales/credit-notes/new" ? (
        <SalesDocumentEditor kind="credit_note" />
      ) : path === "/purchases/bills/new" ? (
        <NewBill />
      ) : null}
    </div>
  );
}
const root = createRootRoute({ component: Layout });
const paths = [
  ...new Set([
    ...navItems.map((item) => item.to),
    ...PURCHASES_SECTIONS.map((item) => item.to),
    ...SALES_SECTIONS.map((item) => item.to),
    "/sales/invoices/$invoiceId",
    "/purchases/bills/$billId",
    "/sales/quotes/new",
    "/sales/quotes/$quoteId",
    "/sales/credit-notes/new",
    "/sales/credit-notes/$creditNoteId",
    "/sales/customers",
    "/purchases/suppliers",
    "/purchases/expenses",
    "/purchases/expenses/new",
    "/purchases/payments",
    "/banking/reconcile",
    "/",
    "/sales/invoices",
    "/purchases/bills",
    "/banking",
    "/contacts",
    "/sales/invoices/new",
    "/purchases/bills/new",
    "/sales",
    "/purchases",
    "/reports",
    "/fixed-assets",
  ]),
];
const router = createRouter({
  routeTree: root.addChildren(
    paths.map((path) => createRoute({ getParentRoute: () => root, path, component: Destination })),
  ),
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
