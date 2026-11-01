import { SettingsDestinationLink } from "@/components/settings/ModuleSettingsLinks";
import { SalesDefaultsForm } from "@/components/settings/SalesDefaultsForm";
import { ModuleSettingsLinks } from "@/components/settings/ModuleSettingsLinks";
import { createFileRoute } from "@tanstack/react-router";
import { useActiveCompany } from "@/hooks/use-active-company";

import { PageHeader, LoadingState } from "@/components/common/states";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/sales/settings")({
  head: () => ({ meta: [{ title: "Sales settings — LinkBooks" }] }),
  component: SalesSettingsPage,
});

function SalesSettingsPage() {
  const { company, isPending } = useActiveCompany();
  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  return (
    <>
      <PageHeader
        title="Sales settings"
        description="Payment terms, quotes and invoice notes, with quick access to branding, numbering and other sales settings."
        actions={
          <Button variant="outline" size="sm" asChild>
            <SettingsDestinationLink destination={{ to: "/settings", section: "overview" }}>
              Organisation settings
            </SettingsDestinationLink>
          </Button>
        }
      />
      <ModuleSettingsLinks category="sales" />
      <SalesDefaultsForm key={company.id} companyId={company.id} />
    </>
  );
}
