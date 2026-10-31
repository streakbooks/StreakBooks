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
import { queryClient } from "./fixture-state";
import "@/styles.css";

export function Layout() {
  return (
    <main>
      <header className="flex items-center gap-4 p-4">
        <Link to="/">Dashboard link</Link>
        <Link to="/contacts" search={{ view: undefined }}>
          Contacts link
        </Link>
        <VoiceAssistant />
      </header>
      <Outlet />
    </main>
  );
}
export function Destination() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  return <h1>Destination: {path}</h1>;
}
const root = createRootRoute({ component: Layout });
const paths = [
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
