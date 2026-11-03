import { PlatformOperations } from "../../src/components/platform/PlatformOperations";
import { parseOpsSearch } from "../../src/lib/platform/operations";
import { PlatformAutomation } from "../../src/components/platform/PlatformAutomation";
import { parseAutomationSearch } from "../../src/lib/platform/automation";
import { useState } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { PlatformSearch } from "../../src/components/platform/PlatformSearch";
import { PlatformRecordDialog } from "../../src/components/platform/PlatformRecordDialog";
import { parsePlatformSearch, recordResource } from "../../src/lib/platform/navigation";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PlatformCustomer360 } from "../../src/components/platform/PlatformCustomer360";
import { PlatformSupport } from "../../src/components/platform/PlatformSupport";
import { PlatformApprovals } from "../../src/components/platform/PlatformApprovals";
import type { PlatformContext } from "../../src/lib/platform/catalog";
import "../../src/styles.css";
const params = new URLSearchParams(location.search);
const readOnly = params.has("readonly");
const context: PlatformContext = {
  role: "platform_owner",
  userId: "00000000-0000-4000-8000-000000000001",
  permissions: readOnly ? ["support.view"] : ["support.view", "support.manage", "approvals.manage"],
};
const related = {
  members: [
    {
      user_id: "member-1",
      full_name: "Client One",
      email: "client@example.invalid",
      role: "owner",
      status: "active",
    },
  ],
  subscription: params.has("nosub")
    ? null
    : { plan: "growth", status: "trialing", interval: "month", trialEnds: "2030-11-03T12:00:00Z" },
  events: params.has("nobilling")
    ? null
    : [
        {
          event_type: "subscription.updated",
          provider: "stripe",
          created_at: "2026-11-02T10:00:00Z",
        },
      ],
};
export function FixtureSupport() {
  const [company, setCompany] = useState("");
  return (
    <>
      <PlatformSupport context={context} onRead={setCompany} />
      {company ? <p role="status">Diagnostic business selected: {company}</p> : null}
    </>
  );
}
export function FixtureHome() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <h1>Platform component fixture</h1>
      <p>Synthetic data; authorization verified separately in PostgreSQL.</p>
      {params.has("approvals") ? (
        <PlatformApprovals canManage={!readOnly} userId={context.userId} canGrant={false} />
      ) : (
        <>
          <PlatformCustomer360
            business={{
              id: "20000000-0000-4000-8000-000000000001",
              name: "Example Company",
              base_currency: "GBP",
              is_demo: false,
            }}
            related={related}
            canRequestSupport={!readOnly && !params.has("unavailable")}
          />
          <FixtureSupport />
        </>
      )}
    </main>
  );
}
const navigationContext = {
  ...context,
  permissions: readOnly
    ? ["support.view"]
    : [...context.permissions, "businesses.view", "users.view", "firms.view"],
};
const root = createRootRoute({ component: Outlet });
const home = createRoute({ getParentRoute: () => root, path: "/", component: FixtureHome });
const platform = createRoute({
  getParentRoute: () => root,
  path: "/platform",
  validateSearch: parsePlatformSearch,
  component: FixturePlatform,
});
export function FixturePlatform() {
  const { section, record } = platform.useSearch();
  const navigate = platform.useNavigate();
  const resource = recordResource(section);
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <h1>Platform navigation fixture</h1>
      <p>Synthetic data; production components and router.</p>
      <PlatformSearch context={navigationContext} />
      <p>{section} workspace</p>
      {resource && record ? (
        <PlatformRecordDialog
          resource={resource}
          id={record}
          context={navigationContext}
          onClose={() => void navigate({ search: { section }, replace: true })}
        />
      ) : null}
    </main>
  );
}
const operations = createRoute({
  getParentRoute: () => root,
  path: "/platform/operations",
  validateSearch: parseOpsSearch,
  component: FixtureOperations,
});
function FixtureOperations() {
  const search = operations.useSearch();
  const navigate = operations.useNavigate();
  return (
    <main className="mx-auto max-w-5xl p-6">
      <PlatformOperations
        {...search}
        onOpen={(item) => void navigate({ search: { ...search, item } })}
        onModule={(module) => void navigate({ search: { module } })}
        onClose={() => void navigate({ search: { ...search, item: undefined }, replace: true })}
      />
    </main>
  );
}
const automation = createRoute({
  getParentRoute: () => root,
  path: "/platform/automation",
  validateSearch: parseAutomationSearch,
  component: FixtureAutomation,
});
function FixtureAutomation() {
  const search = automation.useSearch();
  const navigate = automation.useNavigate();
  return (
    <main className="mx-auto max-w-5xl p-6">
      <PlatformAutomation
        {...search}
        onOpen={(item) => void navigate({ search: { ...search, item } })}
        onClose={() => void navigate({ search: { ...search, item: undefined }, replace: true })}
        onModule={(module) => void navigate({ search: { module } })}
      />
    </main>
  );
}
const router = createRouter({
  routeTree: root.addChildren([home, platform, operations, automation]),
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
