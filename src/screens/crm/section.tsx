import { CrmSubnav } from "@/components/crm/CrmSubnav";
import { EmptyState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import { crmSection, type CrmSectionKey } from "@/lib/crm/sections";
import { CrmAccountsPage } from "@/screens/crm/accounts";
import { CrmActivitiesPage } from "@/screens/crm/activities";
import { CrmLeadsPage } from "@/screens/crm/leads";
import { CrmOpportunitiesPage } from "@/screens/crm/opportunities";
import { CrmPipelinesPage } from "@/screens/crm/pipelines";
import { CrmAutomationPage } from "@/screens/crm/automation";
import { CrmCampaignsPage } from "@/screens/crm/campaigns";
import { CrmCommunicationsPage } from "@/screens/crm/communications";
import { CrmForecastingPage } from "@/screens/crm/forecasting";
import { CrmImportsPage } from "@/screens/crm/imports";
import { CrmQuotesPage } from "@/screens/crm/quotes";
import { CrmRelationshipsPage } from "@/screens/crm/relationships";
import { CrmReportsPage } from "@/screens/crm/reports";
import { CrmSettingsPage } from "@/screens/crm/settings";
import { CrmTeamPage } from "@/screens/crm/team";

const DEFERRED_LINKS: Partial<Record<CrmSectionKey, { href: string; label: string }>> = {
  products: { href: "/products-services", label: "Open Products & Services" },
};

/**
 * Dispatches CRM section routes. Fully wired sections render their screens.
 * Later-batch sections stay honest and fail-closed — no fake KPIs or dummy actions.
 */
export function CrmSectionPage({ sectionKey }: { sectionKey: CrmSectionKey }) {
  if (sectionKey === "leads") return <CrmLeadsPage />;
  if (sectionKey === "accounts") return <CrmAccountsPage current="accounts" />;
  if (sectionKey === "contacts") return <CrmAccountsPage current="contacts" />;
  if (sectionKey === "opportunities") return <CrmOpportunitiesPage />;
  if (sectionKey === "pipelines") return <CrmPipelinesPage />;
  if (sectionKey === "quotes") return <CrmQuotesPage />;
  if (sectionKey === "relationships") return <CrmRelationshipsPage />;
  if (sectionKey === "forecasting") return <CrmForecastingPage />;
  if (sectionKey === "reports") return <CrmReportsPage />;
  if (sectionKey === "communications") return <CrmCommunicationsPage />;
  if (sectionKey === "campaigns") return <CrmCampaignsPage />;
  if (sectionKey === "automation") return <CrmAutomationPage />;
  if (sectionKey === "imports") return <CrmImportsPage />;
  if (sectionKey === "team") return <CrmTeamPage />;
  if (sectionKey === "settings") return <CrmSettingsPage />;
  if (sectionKey === "activities" || sectionKey === "tasks" || sectionKey === "calendar") {
    return <CrmActivitiesPage sectionKey={sectionKey} />;
  }

  const section = crmSection(sectionKey);
  const bridge = DEFERRED_LINKS[sectionKey];

  return (
    <ListWorkspace
      title={section.label}
      description={`Scheduled for ${section.batch}. Navigation and permissions are live; domain workflows remain fail-closed until that batch lands.`}
      breadcrumbs={[{ label: "CRM", to: "/crm" }, { label: section.label }]}
    >
      <CrmSubnav current={sectionKey} />
      <EmptyState
        title={`${section.label} arrives in ${section.batch}`}
        description={
          bridge
            ? "Use the existing LinkBooks module for the shared master data. CRM-specific overlays will attach in the listed batch without duplicating customer records."
            : "This surface is registered for deep links and access control. Backend capabilities will ship in the listed batch with real authorization and persistence."
        }
        action={
          bridge ? (
            <Button asChild>
              <a href={bridge.href}>{bridge.label}</a>
            </Button>
          ) : (
            <Button type="button" disabled title="Blocked until authorised backend exists">
              Actions unavailable
            </Button>
          )
        }
      />
    </ListWorkspace>
  );
}
