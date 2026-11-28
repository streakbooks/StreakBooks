import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RealEstateSubnav } from "@/components/real-estate/RealEstateSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { getRealEstateWorkspace } from "@/lib/real-estate/real-estate.functions";
import {
  isReSectionKey,
  reSection,
  type ReSectionKey,
  type RealEstateSearch,
} from "@/lib/real-estate/sections";
import type { Permission } from "@/lib/permissions";
import { RealEstateSection } from "@/screens/real-estate/panels";

export function RealEstatePage({
  sectionKey,
  search,
}: {
  sectionKey: string;
  search: RealEstateSearch;
}) {
  const section = isReSectionKey(sectionKey) ? reSection(sectionKey) : null;
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const allowed = section?.anyOf.some((permission) => can(permission as Permission)) ?? false;
  const fetchWorkspace = useServerFn(getRealEstateWorkspace);
  const workspace = useQuery({
    queryKey: ["real-estate-workspace", company?.id],
    queryFn: () => fetchWorkspace({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && allowed,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!section) {
    return (
      <EmptyState title="Unknown section" description="That Real Estate page does not exist." />
    );
  }
  if (!company) {
    return (
      <CompanyEmptyState title="No organisation" description="Select an organisation first." />
    );
  }
  if (!allowed) {
    return (
      <ListWorkspace title={section.label} description="Property development and sales.">
        <EmptyState
          title="No Real Estate access"
          description="Ask an administrator for realestate.view or the permission named on this section."
        />
      </ListWorkspace>
    );
  }
  if (workspace.isError) {
    return (
      <ListWorkspace
        title={section.label}
        description="Property development and sales."
        breadcrumbs={crumbs(section.key, section.label)}
        subnav={<RealEstateSubnav current={section.key} />}
      >
        <QueryErrorState queries={[workspace]} />
      </ListWorkspace>
    );
  }
  if (workspace.isPending || !workspace.data) return <LoadingState />;
  const data = workspace.data;
  const enabled = data.settings.enabled;

  return (
    <ListWorkspace
      title={section.label}
      description="Development sales post through the StreakBooks ledger. A payment schedule is not revenue."
      breadcrumbs={crumbs(section.key, section.label)}
      subnav={<RealEstateSubnav current={section.key} />}
    >
      {!enabled && sectionKey !== "settings" ? (
        <EmptyState
          title="Real Estate Management is not activated"
          description="An administrator maps the ledger accounts and activates the module in Settings. Rental property management is unchanged."
          action={
            <Button asChild>
              <Link to="/real-estate/$section" params={{ section: "settings" }} search={search}>
                Open settings
              </Link>
            </Button>
          }
        />
      ) : (
        <RealEstateSection
          sectionKey={section.key}
          companyId={company.id}
          currency={company.base_currency || "USD"}
          data={data}
          search={search}
        />
      )}
    </ListWorkspace>
  );
}

function crumbs(sectionKey: ReSectionKey, label: string) {
  if (!isReSectionKey(sectionKey) || sectionKey === "overview") return [{ label: "Real Estate" }];
  return [{ label: "Real Estate", to: "/real-estate" }, { label }];
}
