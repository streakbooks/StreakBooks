import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/states";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/advisors-admin/")({
  head: () => ({
    meta: [{ title: "Advisors overview — LinkBooks" }],
  }),
  component: AdvisorsOverviewRoute,
});

function AdvisorsOverviewRoute() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        title="Advisors"
        description="Manage Advisors services and pricing. Inquiry, booking and delivery workspaces arrive in later batches."
      />
      <Button asChild>
        <Link to="/advisors-admin/settings/services-pricing">Open Services & Pricing</Link>
      </Button>
    </main>
  );
}
