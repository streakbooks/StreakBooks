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
import { Route as TransferRoute } from "@/routes/_authenticated/banking/transfers";
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
  id: "/banking/transfers",
  path: "/banking/transfers",
} as never);
const router = createRouter({
  routeTree: root.addChildren([auth.addChildren([home, order, credit, transfer])]),
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
