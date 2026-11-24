import { createFileRoute } from "@tanstack/react-router";
import { LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { PortalInbox } from "@/components/portals/staff-panels";
import { useActiveCompany } from "@/hooks/use-active-company";

export const Route = createFileRoute("/_authenticated/purchases/portal-inbox")({
  head: () => ({ meta: [{ title: "Portal inbox — StreakBooks" }] }),
  component: PortalInboxPage,
});

function PortalInboxPage() {
  const { company, isPending } = useActiveCompany();
  if (isPending) return <LoadingState />;
  if (!company) return null;
  return (
    <ListWorkspace
      title="Portal inbox"
      description="Review supplier bills, credit notes and bank-detail changes before they affect the ledger."
    >
      <PortalInbox companyId={company.id} />
    </ListWorkspace>
  );
}
