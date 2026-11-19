import { Route as SupplierPaymentsRoute } from "@/routes/_authenticated/purchases/payments.index";
import { Route as RecurringJournalsRoute } from "@/routes/_authenticated/recurring-journals";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../voice/fixture-state";
import { CreateNewMenu } from "@/components/create-new/CreateNewMenu";
import { Route as OrderRoute } from "@/routes/_authenticated/purchases/orders.new";
import { Route as CreditRoute } from "@/routes/_authenticated/purchases/credit-notes.new";
import { Route as TransferRoute } from "@/routes/_authenticated/banking/transfers.new";
import { Route as AccountingRoute } from "@/routes/_authenticated/accounting";
import { Route as JournalRoute } from "@/routes/_authenticated/accounting/journals.new";
import { Route as BankDocumentsRoute } from "@/routes/_authenticated/banking/money-documents";
import { Route as BankDocumentNewRoute } from "@/routes/_authenticated/banking/money-documents.new";
import { Route as SpendRoute } from "@/routes/_authenticated/banking/spend-money";
import { Route as ReceiveRoute } from "@/routes/_authenticated/banking/receive-money";
import "../../src/styles.css";
export function Home() {
  return (
    <main className="p-5">
      <h1>Unrelated dashboard</h1>
    </main>
  );
}
export function AuthLayout() {
  return (
    <>
      <CreateNewMenu />
      <Outlet />
    </>
  );
}
const root = createRootRoute({ component: Outlet });
const auth = createRoute({
  getParentRoute: () => root,
  id: "_authenticated",
  beforeLoad: () => ({ user: { id: "fixture-user", email: "fixture@example.test" } }),
  component: AuthLayout,
});
const home = createRoute({
  getParentRoute: () => auth,
  path: "/",
  validateSearch: (input: Record<string, unknown>) => input,
  component: Home,
});
// Same file-route registration shape as generated production routeTree; no auth or API writes.
const order = OrderRoute.update({
  getParentRoute: () => auth,
  id: "/purchases/orders/new",
  path: "/purchases/orders/new",
} as never);
const credit = CreditRoute.update({
  getParentRoute: () => auth,
  id: "/purchases/credit-notes/new",
  path: "/purchases/credit-notes/new",
} as never);
const transfer = TransferRoute.update({
  getParentRoute: () => auth,
  id: "/banking/transfers/new",
  path: "/banking/transfers/new",
} as never);
const accounting = AccountingRoute.update({
  getParentRoute: () => auth,
  id: "/accounting",
  path: "/accounting",
} as never);
const journal = JournalRoute.update({
  getParentRoute: () => accounting,
  id: "/journals/new",
  path: "/journals/new",
} as never);
const bankDocuments = BankDocumentsRoute.update({
  getParentRoute: () => auth,
  id: "/banking/money-documents",
  path: "/banking/money-documents",
} as never);
const bankDocument = BankDocumentNewRoute.update({
  getParentRoute: () => bankDocuments,
  id: "/new",
  path: "/new",
} as never);
const spend = SpendRoute.update({
  getParentRoute: () => auth,
  id: "/banking/spend-money",
  path: "/banking/spend-money",
} as never);
const receive = ReceiveRoute.update({
  getParentRoute: () => auth,
  id: "/banking/receive-money",
  path: "/banking/receive-money",
} as never);
const recurringJournals = RecurringJournalsRoute.update({
  getParentRoute: () => auth,
  id: "/recurring-journals",
  path: "/recurring-journals",
} as never);
const supplierPayments = SupplierPaymentsRoute.update({
  getParentRoute: () => auth,
  id: "/purchases/payments/",
  path: "/purchases/payments/",
} as never);
const router = createRouter({
  routeTree: root.addChildren([
    auth.addChildren([
      home,
      order,
      credit,
      transfer,
      accounting.addChildren([journal]),
      bankDocuments.addChildren([bankDocument]),
      spend,
      receive,
      recurringJournals,
      supplierPayments,
    ]),
  ]),
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
