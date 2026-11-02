import { useState } from "react";
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
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
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
  </QueryClientProvider>,
);
