import { PmSubnav } from "@/components/property-management/PmSubnav";
import { EmptyState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import { pmSection, type PmSectionKey } from "@/lib/property-management/sections";
import { PmPropertiesPage } from "@/screens/property-management/properties";
import { PmUnitsPage } from "@/screens/property-management/units";
import { PmOwnersPage } from "@/screens/property-management/owners";
import { PmAgreementsPage } from "@/screens/property-management/agreements";
import { PmSettingsPage } from "@/screens/property-management/settings";

/**
 * Dispatches Property Management section routes.
 * Wired sections render real screens; later batches stay honest and fail-closed.
 */
export function PmSectionPage({ sectionKey }: { sectionKey: PmSectionKey }) {
  if (sectionKey === "properties") return <PmPropertiesPage />;
  if (sectionKey === "units") return <PmUnitsPage />;
  if (sectionKey === "owners") return <PmOwnersPage />;
  if (sectionKey === "agreements") return <PmAgreementsPage />;
  if (sectionKey === "settings") return <PmSettingsPage />;

  const section = pmSection(sectionKey);

  return (
    <ListWorkspace
      title={section.label}
      description={`Scheduled for ${section.batch}. Navigation and permissions are live; domain workflows remain fail-closed until that batch lands.`}
      breadcrumbs={[
        { label: "Property Management", to: "/property-management" },
        { label: section.label },
      ]}
    >
      <PmSubnav current={sectionKey} />
      <EmptyState
        title={`${section.label} arrives in ${section.batch}`}
        description="This surface is registered for deep links and access control. Backend capabilities will ship in the listed batch with real authorization and persistence."
        action={
          <Button type="button" disabled title="Blocked until authorised backend exists">
            Actions unavailable
          </Button>
        }
      />
    </ListWorkspace>
  );
}
