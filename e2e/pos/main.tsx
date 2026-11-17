import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PosRegistersScreen } from "@/screens/pos/registers";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useRouterState,
} from "@tanstack/react-router";
import { PosScreen } from "@/screens/pos";
import "../../src/styles.css";
export function Scenario() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return pathname.includes("registers") ? <PosRegistersScreen /> : <PosScreen />;
}
const root = createRootRoute({ component: Scenario });
const child = createRoute({ getParentRoute: () => root, path: "$" });
const router = createRouter({ routeTree: root.addChildren([child]) });
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <main className="p-4">
      <RouterProvider router={router} />
    </main>
  </QueryClientProvider>,
);
