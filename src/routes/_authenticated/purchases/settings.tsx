import { SettingsDestinationLink } from "@/components/settings/ModuleSettingsLinks";
import { PurchasesDefaultsForm } from "@/components/settings/PurchasesDefaultsForm";
import { ModuleSettingsLinks } from "@/components/settings/ModuleSettingsLinks";
import { createFileRoute } from "@tanstack/react-router";
import { useActiveCompany } from "@/hooks/use-active-company";

import { LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/purchases/settings")({
  head: () => ({ meta: [{ title: "Purchases settings — StreakBooks" }] }),
  component: PurchasesSettingsPage,
});

function PurchasesSettingsPage() {
  const { company, isPending } = useActiveCompany();
  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  return (
    <ListWorkspace
      title="Purchases settings"
      description="Supplier terms and bill policies, with quick access to document themes, numbering and other purchase settings."
      actions={
        <Button variant="outline" size="sm" asChild>
          <SettingsDestinationLink destination={{ to: "/settings", section: "overview" }}>
            Organisation settings
          </SettingsDestinationLink>
        </Button>
      }
    >
      <ModuleSettingsLinks category="purchases" />
      <PurchasesDefaultsForm key={company.id} companyId={company.id} />
    </ListWorkspace>
  );
}
